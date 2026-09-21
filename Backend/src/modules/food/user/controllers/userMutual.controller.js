import { sendResponse } from '../../../../utils/response.js';
import { getMutualTopUsers } from '../services/userMutual.service.js';

export const getMutualUsersController = async (req, res, next) => {
    try {
        const result = await getMutualTopUsers(req.user?.userId);
        return sendResponse(res, 200, 'Mutual users fetched successfully', result);
    } catch (error) {
        next(error);
    }
};
