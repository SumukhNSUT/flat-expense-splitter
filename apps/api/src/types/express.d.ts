export interface RequestUser {
  id: string;
  name: string;
  email: string;
}

export interface RequestFlatMembership {
  flatId: string;
  flatName: string;
  joinedAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
      flatMembership?: RequestFlatMembership;
    }
  }
}
