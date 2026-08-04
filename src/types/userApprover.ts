export interface UserApprover {
  configId: string;
  departmentId: number;
  requesterUserId: string;
  approverUserId: string;
  approvalLevel: number;
}
