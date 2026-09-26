import { sendResponse } from '../../../../utils/response.js';
import { getMembersLeaderboard } from '../services/userLeaderboard.service.js';

export const getMembersLeaderboardController = async (req, res, next) => {
    try {
        const { search, limit, page } = req.query;
        const currentUserId = req.user?.userId || req.user?._id || null;
        const result = await getMembersLeaderboard({
            currentUserId,
            search,
            limit,
            page
        });
        return sendResponse(res, 200, 'Members leaderboard fetched successfully', result);
    } catch (error) {
        next(error);
    }
};
