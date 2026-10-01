export function initQuestionCopy(): void {
  if (document.documentElement.dataset.questionCopyReady === '1') return;
  document.documentElement.dataset.questionCopyReady = '1';
  const buttonTimers = new WeakMap<HTMLButtonElement, number>();
  let toastTimer: number | undefined;
  const toast = document.createElement('div');
  toast.className = 'question-copy-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.hidden = true;
  document.body.append(toast);

  function showToast(message: string): void {
    if (toastTimer !== undefined) window.clearTimeout(toastTimer);
    toast.hidden = false;
    toast.textContent = message;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
      toast.textContent = '';
      toastTimer = undefined;
    }, 2200);
  }

  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('.question-copy');
    if (!button) return;
    const options = button.closest('.question-row')?.querySelectorAll<HTMLElement>('p strong');
    if (options?.length !== 2) return;
    const question = `Would you rather ${options[0]?.textContent ?? ''} or ${options[1]?.textContent ?? ''}?`;
    try {
      await navigator.clipboard.writeText(question);
      const previous =
        button.dataset.originalCopyLabel ?? button.getAttribute('aria-label') ?? 'Copy question';
      button.dataset.originalCopyLabel = previous;
      const priorTimer = buttonTimers.get(button);
      if (priorTimer !== undefined) window.clearTimeout(priorTimer);
      button.setAttribute('aria-label', 'Copied');
      button.classList.add('is-copied');
      showToast('Question copied to clipboard');
      buttonTimers.set(
        button,
        window.setTimeout(() => {
          button.setAttribute('aria-label', previous);
          button.classList.remove('is-copied');
        }, 1800),
      );
    } catch {
      button.setAttribute('title', 'Copy unavailable in this browser');
      showToast('Could not copy this question');
    }
  });
}
