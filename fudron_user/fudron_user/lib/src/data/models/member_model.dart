import 'package:flutter/foundation.dart';
import '../../core/config/api_config.dart';

@immutable
class MemberModel {
  final String id;
  final String userId;
  final String name;
  final String profileImage;
  final int orderCount;
  final int rank;
  final String badge;
  final DateTime? joinedAt;
  final bool isCurrentUser;

  const MemberModel({
    required this.id,
    required this.userId,
    required this.name,
    required this.profileImage,
    required this.orderCount,
    required this.rank,
    required this.badge,
    this.joinedAt,
    this.isCurrentUser = false,
  });

  String get fullImageUrl => ApiConfig.resolveMedia(profileImage);

  String get initial {
    if (name.trim().isEmpty) return 'M';
    final parts = name.trim().split(' ');
    if (parts.length >= 2 && parts[0].isNotEmpty && parts[1].isNotEmpty) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name.trim()[0].toUpperCase();
  }

  factory MemberModel.fromApi(Map<String, dynamic> json, {int? fallbackRank}) {
    final uid = json['userId']?.toString() ?? json['id']?.toString() ?? json['_id']?.toString() ?? '';
    final rawName = json['name']?.toString() ?? json['contactName']?.toString() ?? '';
    final orders = (json['orderCount'] as num?)?.toInt() ?? 0;
    
    DateTime? parsedJoinDate;
    if (json['joinedAt'] != null || json['createdAt'] != null) {
      try {
        parsedJoinDate = DateTime.parse((json['joinedAt'] ?? json['createdAt']).toString());
      } catch (_) {}
    }

    String badge = json['badge']?.toString() ?? '';
    if (badge.isEmpty) {
      if (orders >= 50) {
        badge = '👑 Legend Foodie';
      } else if (orders >= 20) {
        badge = '💎 Diamond Eater';
      } else if (orders >= 10) {
        badge = '🥇 Gold Gourmet';
      } else if (orders >= 5) {
        badge = '🥈 Silver Diner';
      } else if (orders >= 1) {
        badge = '🥉 Bronze Foodie';
      } else {
        badge = 'New Member';
      }
    }

    return MemberModel(
      id: uid,
      userId: uid,
      name: rawName.isNotEmpty ? rawName : 'Cravioo Member',
      profileImage: json['profileImage']?.toString() ?? '',
      orderCount: orders,
      rank: (json['rank'] as num?)?.toInt() ?? fallbackRank ?? 0,
      badge: badge,
      joinedAt: parsedJoinDate,
      isCurrentUser: json['isCurrentUser'] == true,
    );
  }
}

@immutable
class MembersLeaderboardResponse {
  final int totalMembers;
  final List<MemberModel> topPodium;
  final MemberModel? myRank;
  final List<MemberModel> members;

  const MembersLeaderboardResponse({
    required this.totalMembers,
    required this.topPodium,
    this.myRank,
    required this.members,
  });

  factory MembersLeaderboardResponse.fromApi(Map<String, dynamic> json) {
    final total = (json['totalMembers'] as num?)?.toInt() ?? 0;
    
    final podiumRaw = (json['topPodium'] as List?) ?? const [];
    final podium = podiumRaw
        .whereType<Map>()
        .map((e) => MemberModel.fromApi(e.cast<String, dynamic>()))
        .toList();

    final membersRaw = (json['members'] as List?) ?? const [];
    final membersList = membersRaw
        .whereType<Map>()
        .map((e) => MemberModel.fromApi(e.cast<String, dynamic>()))
        .toList();

    MemberModel? myRankInfo;
    if (json['myRank'] is Map) {
      myRankInfo = MemberModel.fromApi((json['myRank'] as Map).cast<String, dynamic>());
    }

    return MembersLeaderboardResponse(
      totalMembers: total > 0 ? total : membersList.length,
      topPodium: podium,
      myRank: myRankInfo,
      members: membersList,
    );
  }
}
