export type EmployeeProfile = {
  employee: {
    id: string; displayName: string; departmentName: string; departmentNames: string[];
    photoDataUrl: string; jobTitle: string; isCoordinator: boolean;
    birthdayDay: number | null; birthdayMonth: number | null; supervisorName: string;
  };
  coverDataUrl: string; bio: string; phrase: string; version: number; canEdit: boolean; updatedAt: string | null;
};
