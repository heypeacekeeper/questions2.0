/** Owner-supplied public policy details. Complete and review before deployment. */
export const PUBLISHER = {
  name: '',
  address: '',
  jurisdiction: '',
  copyrightContact: '',
  policyUpdatedAt: '',
  policiesReviewed: false,
};

export function publisherDetailsComplete(details = PUBLISHER): boolean {
  return (
    details.policiesReviewed &&
    [details.name, details.address, details.jurisdiction, details.copyrightContact].every(
      (value) => value.trim().length > 0,
    ) &&
    /^\d{4}-\d{2}-\d{2}$/.test(details.policyUpdatedAt) &&
    Number.isFinite(Date.parse(details.policyUpdatedAt)) &&
    new Date(details.policyUpdatedAt).toISOString().slice(0, 10) === details.policyUpdatedAt
  );
}
