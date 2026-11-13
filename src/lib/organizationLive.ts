import { setOrganizationContent, discoveryGeneratedAt } from '../data/discovery';
import { subscribeToOrganizationProjections, useOrganizationLiveState } from './organizationLiveState';
export { organizationLiveRows } from './organizationLiveState';

subscribeToOrganizationProjections(setOrganizationContent);

export function useOrganizationLive() {
  return useOrganizationLiveState(discoveryGeneratedAt);
}
