import { assert, ReplicaType } from '@lo-fi/common';
import jwt, { JwtPayload } from 'jsonwebtoken';

export class TokenVerifier {
	constructor(private config: { secret: string }) {}

	verifyToken = (token: string): TokenInfo => {
		const decoded = jwt.verify(token, this.config.secret, {
			complete: false,
		}) as JwtPayload;
		assert(decoded.sub);
		return {
			userId: decoded.sub,
			libraryId: decoded.lib,
			syncEndpoint: decoded.url,
			role: decoded.role,
			type: decoded.type,
		};
	};
}

export interface TokenInfo {
	userId: string;
	libraryId: string;
	syncEndpoint: string;
	role?: string;
	type: ReplicaType;
}
