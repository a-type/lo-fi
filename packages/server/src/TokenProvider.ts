import { ReplicaType } from '@lo-fi/common';
import jwt from 'jsonwebtoken';

export class TokenProvider {
	constructor(private config: { secret: string }) {}

	getToken = ({
		userId,
		libraryId,
		syncEndpoint,
		role,
		type = ReplicaType.Realtime,
		expiresIn = '1d',
	}: {
		userId: string;
		libraryId: string;
		syncEndpoint: string;
		role?: string;
		type?: ReplicaType;
		expiresIn?: string | number;
	}) => {
		return jwt.sign(
			{
				sub: userId,
				lib: libraryId,
				url: syncEndpoint,
				role,
				type,
			},
			this.config.secret,
			{
				expiresIn,
			},
		);
	};
}
