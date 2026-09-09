export interface AuthUser {
  id: string;
  email: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}
