/**
 * Starface REST API type definitions.
 * Based on Starface Swagger documentation.
 */

/** Starface login response (Step 1) */
export interface StarfaceLoginChallenge {
  loginType: 'Internal' | 'ActiveDirectory';
  nonce: string;
  secret: null;
}

/** Starface login request (Step 3) */
export interface StarfaceLoginRequest {
  loginType: string;
  nonce: string;
  secret: string;
}

/** Starface login response with token (Step 3 response) */
export interface StarfaceLoginResponse {
  authToken: string;
}

/** Starface call service entry */
export interface StarfaceCallEntry {
  id: string;
  callerId: string;
  callerName?: string;
  calledId: string;
  calledName?: string;
  state: string;
  direction: string;
  startTime: string;
  duration?: number;
  groupId?: string;
  groupName?: string;
}

/** Starface contact entry */
export interface StarfaceContact {
  id: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phoneNumbers: StarfacePhoneNumber[];
  emails?: string[];
}

/** Starface phone number */
export interface StarfacePhoneNumber {
  number: string;
  type: string;
}

/** Starface user entry */
export interface StarfaceUser {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumbers?: StarfacePhoneNumber[];
  groupIds?: string[];
}

/** Starface group entry */
export interface StarfaceGroup {
  id: string;
  name: string;
  groupNumber: string;
  memberIds: string[];
}

/** Starface voicemail box */
export interface StarfaceVoicemailBox {
  id: string;
  name: string;
  userId?: string;
  groupId?: string;
  messageCount: number;
}

/** Starface voicemail message */
export interface StarfaceVoicemailMessage {
  id: string;
  boxId: string;
  callerId: string;
  callerName?: string;
  date: string;
  duration: number;
  isNew: boolean;
}

/** Starface redirect configuration */
export interface StarfaceRedirect {
  id: string;
  userId: string;
  type: string;
  destination: string;
  enabled: boolean;
}

/** Generic Starface API error */
export interface StarfaceApiError {
  status: number;
  message: string;
  error?: string;
}
