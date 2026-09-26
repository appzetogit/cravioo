import 'package:flutter/foundation.dart';
import '../../../data/models/member_model.dart';

@immutable
class MembersState {
  final bool isLoading;
  final bool isRefreshing;
  final String searchQuery;
  final int totalMembers;
  final List<MemberModel> topPodium;
  final MemberModel? myRank;
  final List<MemberModel> members;
  final String? errorMessage;

  const MembersState({
    this.isLoading = false,
    this.isRefreshing = false,
    this.searchQuery = '',
    this.totalMembers = 0,
    this.topPodium = const [],
    this.myRank,
    this.members = const [],
    this.errorMessage,
  });

  MembersState copyWith({
    bool? isLoading,
    bool? isRefreshing,
    String? searchQuery,
    int? totalMembers,
    List<MemberModel>? topPodium,
    MemberModel? myRank,
    List<MemberModel>? members,
    String? errorMessage,
  }) {
    return MembersState(
      isLoading: isLoading ?? this.isLoading,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      searchQuery: searchQuery ?? this.searchQuery,
      totalMembers: totalMembers ?? this.totalMembers,
      topPodium: topPodium ?? this.topPodium,
      myRank: myRank ?? this.myRank,
      members: members ?? this.members,
      errorMessage: errorMessage,
    );
  }
}
