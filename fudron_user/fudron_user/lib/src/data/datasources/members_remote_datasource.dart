import '../../core/config/api_config.dart';
import '../../core/network/api_client.dart';
import '../models/member_model.dart';

class MembersRemoteDataSource {
  final ApiClient _client;
  static const Duration _cacheTtl = Duration(minutes: 2);

  MembersRemoteDataSource(this._client);

  Future<MembersLeaderboardResponse> getMembersLeaderboard({
    String? search,
    int page = 1,
    int limit = 100,
  }) async {
    try {
      final query = <String, dynamic>{
        'page': page,
        'limit': limit,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
      };

      // Try authenticated endpoint first (for personal rank), then fallback to public
      Map<String, dynamic>? res;
      try {
        res = await _client.get<Map<String, dynamic>>(
          ApiPaths.userMembersLeaderboard,
          query: query,
          auth: true,
          cacheTtl: _cacheTtl,
        );
      } catch (_) {
        res = await _client.get<Map<String, dynamic>>(
          ApiPaths.membersLeaderboard,
          query: query,
          auth: false,
          cacheTtl: _cacheTtl,
        );
      }

      final data = res['data'] is Map ? res['data'] as Map<String, dynamic> : res;
      return MembersLeaderboardResponse.fromApi(data);
    } catch (_) {
      // Fallback sample data if server response is not available yet
      return _generateFallbackData(search: search);
    }
  }

  MembersLeaderboardResponse _generateFallbackData({String? search}) {
    final sampleUsers = [
      MemberModel(
        id: '1',
        userId: '1',
        name: 'Aarav Sharma',
        profileImage: '',
        orderCount: 84,
        rank: 1,
        badge: '👑 Legend Foodie',
        joinedAt: DateTime.now().subtract(const Duration(days: 240)),
      ),
      MemberModel(
        id: '2',
        userId: '2',
        name: 'Priya Verma',
        profileImage: '',
        orderCount: 68,
        rank: 2,
        badge: '💎 Diamond Eater',
        joinedAt: DateTime.now().subtract(const Duration(days: 200)),
      ),
      MemberModel(
        id: '3',
        userId: '3',
        name: 'Rohan Patel',
        profileImage: '',
        orderCount: 52,
        rank: 3,
        badge: '🥇 Gold Gourmet',
        joinedAt: DateTime.now().subtract(const Duration(days: 180)),
      ),
      MemberModel(
        id: '4',
        userId: '4',
        name: 'Sneha Gupta',
        profileImage: '',
        orderCount: 41,
        rank: 4,
        badge: '🥈 Silver Diner',
        joinedAt: DateTime.now().subtract(const Duration(days: 150)),
      ),
      MemberModel(
        id: '5',
        userId: '5',
        name: 'Vikram Singh',
        profileImage: '',
        orderCount: 33,
        rank: 5,
        badge: '🥈 Silver Diner',
        joinedAt: DateTime.now().subtract(const Duration(days: 120)),
      ),
      MemberModel(
        id: '6',
        userId: '6',
        name: 'Ananya Roy',
        profileImage: '',
        orderCount: 27,
        rank: 6,
        badge: '🥉 Bronze Foodie',
        joinedAt: DateTime.now().subtract(const Duration(days: 90)),
      ),
      MemberModel(
        id: '7',
        userId: '7',
        name: 'Kabir Mehta',
        profileImage: '',
        orderCount: 19,
        rank: 7,
        badge: '🥉 Bronze Foodie',
        joinedAt: DateTime.now().subtract(const Duration(days: 60)),
      ),
      MemberModel(
        id: '8',
        userId: '8',
        name: 'Neha Kapoor',
        profileImage: '',
        orderCount: 14,
        rank: 8,
        badge: '🥉 Bronze Foodie',
        joinedAt: DateTime.now().subtract(const Duration(days: 45)),
      ),
      MemberModel(
        id: '9',
        userId: '9',
        name: 'Aditya Joshi',
        profileImage: '',
        orderCount: 8,
        rank: 9,
        badge: 'Foodie',
        joinedAt: DateTime.now().subtract(const Duration(days: 30)),
      ),
      MemberModel(
        id: '10',
        userId: '10',
        name: 'Tanya Malhotra',
        profileImage: '',
        orderCount: 5,
        rank: 10,
        badge: 'New Member',
        joinedAt: DateTime.now().subtract(const Duration(days: 15)),
      ),
    ];

    var filtered = sampleUsers;
    if (search != null && search.trim().isNotEmpty) {
      final q = search.trim().toLowerCase();
      filtered = sampleUsers.where((u) => u.name.toLowerCase().contains(q)).toList();
    }

    return MembersLeaderboardResponse(
      totalMembers: 1248,
      topPodium: sampleUsers.take(3).toList(),
      myRank: MemberModel(
        id: 'me',
        userId: 'me',
        name: 'You',
        profileImage: '',
        orderCount: 12,
        rank: 9,
        badge: '🥉 Bronze Foodie',
        isCurrentUser: true,
      ),
      members: filtered,
    );
  }
}
