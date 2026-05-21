// Centralized error codes used in NestJS exception responses across services.
// Pattern: { code, message } passed to BadRequestException / ForbiddenException / etc.
// The HTTP status comes from the exception class; the numeric code is for
// client-side branching (e.g. "show upgrade modal on 40901").

export const ErrCode = {
  // 4000x  bad input / validation
  BAD_INPUT: 40001,
  INVALID_LINK: 40002,
  REF_UNAVAILABLE: 40003,

  // 4030x  forbidden / not your resource
  NOT_TEAM_MEMBER: 40301,
  ACCOUNT_NOT_IN_TEAM: 40302,
  NO_REVIEW_PERMISSION: 40303,

  // 4040x  not found
  INVITE_INVALID: 40401,

  // 4090x  quota / capacity / conflict
  QUOTA_EXCEEDED: 40901,
  ALREADY_MEMBER: 40902,

  // 5000x  upstream / IO failures
  IMAGE_DISPATCH_FAILED: 50001,

  // 5030x  capability not ready
  DOCKER_UNAVAILABLE: 50301,
} as const;

export type ErrCodeValue = typeof ErrCode[keyof typeof ErrCode];
