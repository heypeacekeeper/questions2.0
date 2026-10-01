import { isCompletionMilestone, milestoneIcon } from './game-progress';

export interface GameMilestoneController {
  readonly visible: boolean;
  recordCompletedQuestion(): void;
  hide(): void;
}

interface GameMilestoneOptions {
  readonly element: HTMLButtonElement | null;
  readonly iconElement: HTMLElement | null;
  readonly countElement: HTMLElement | null;
  readonly focusTarget: HTMLButtonElement | null;
  readonly session: Storage | null;
  readonly storageKey: string;
  readonly enabled: boolean;
  readonly announce: (message: string) => void;
  readonly onContinue: () => Promise<void>;
}

export function createGameMilestoneController({
  element,
  iconElement,
  countElement,
  focusTarget,
  session,
  storageKey,
  enabled,
  announce,
  onContinue,
}: GameMilestoneOptions): GameMilestoneController {
  const storedCount = Number.parseInt(session?.getItem(storageKey) ?? '0', 10);
  let completedQuestions = Number.isInteger(storedCount) && storedCount >= 0 ? storedCount : 0;
  let visible = false;
  let leaving = false;
  let displayTimer: number | null = null;
  let hideTimer: number | null = null;

  function clearDisplayTimer(): void {
    if (displayTimer === null) return;
    window.clearTimeout(displayTimer);
    displayTimer = null;
  }

  function clearHideTimer(): void {
    if (hideTimer === null) return;
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }

  function hide(): void {
    if (!element || !visible || leaving) return;

    leaving = true;
    const shouldRestoreFocus = document.activeElement === element;
    clearDisplayTimer();
    clearHideTimer();

    // Prepare the next question behind the overlay before it slides away.
    void Promise.resolve()
      .then(onContinue)
      .catch(() => announce('Could not load the next question. Try again.'))
      .finally(() => {
        element.classList.remove('is-visible');
        element.classList.add('is-leaving');

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        hideTimer = window.setTimeout(
          () => {
            element.hidden = true;
            element.classList.remove('is-leaving');
            visible = false;
            leaving = false;
            hideTimer = null;

            if (shouldRestoreFocus) {
              focusTarget?.focus({ preventScroll: true });
            }
          },
          reducedMotion ? 0 : 950,
        );
      });
  }

  function show(count: number): void {
    if (!element || !iconElement || !countElement) return;

    clearDisplayTimer();
    clearHideTimer();
    leaving = false;

    iconElement.textContent = milestoneIcon(count);
    countElement.textContent = String(count);
    element.setAttribute('aria-label', `${count} questions completed. Continue`);
    element.classList.remove('is-visible', 'is-leaving');
    element.hidden = false;
    visible = true;
    element.focus({ preventScroll: true });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (visible) element.classList.add('is-visible');
      });
    });

    announce(`${count} questions completed.`);
    displayTimer = window.setTimeout(hide, 2500);
  }

  function recordCompletedQuestion(): void {
    if (!enabled) return;

    completedQuestions += 1;

    try {
      session?.setItem(storageKey, String(completedQuestions));
    } catch {
      // Continue using the in-memory count when storage is unavailable.
    }

    if (isCompletionMilestone(completedQuestions)) {
      show(completedQuestions);
    }
  }

  element?.addEventListener('click', hide);
  element?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    event.preventDefault();
    hide();
  });

  return {
    get visible() {
      return visible;
    },
    recordCompletedQuestion,
    hide,
  };
}
