export const FOLLOWUP_VALIDATION_SCREEN = "followupValidation";
type User = {
  fullAccess?: boolean;
  permissions?: { screen: string; canView: boolean; canEdit: boolean }[];
};
export function followupValidationAccess(user: User) {
  const permission = user.permissions?.find(
    (entry) => entry.screen === FOLLOWUP_VALIDATION_SCREEN,
  );
  return {
    view: user.fullAccess === true || permission?.canView === true,
    edit:
      user.fullAccess === true ||
      (permission?.canView === true && permission.canEdit === true),
  };
}
