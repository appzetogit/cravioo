import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../data/datasources/members_remote_datasource.dart';
import '../../../di/members_providers.dart';
import 'members_state.dart';

final membersViewModelProvider =
    NotifierProvider<MembersViewModel, MembersState>(() {
  return MembersViewModel();
});

class MembersViewModel extends Notifier<MembersState> {
  late final MembersRemoteDataSource _dataSource;
  Timer? _debounceTimer;

  @override
  MembersState build() {
    _dataSource = ref.watch(membersRemoteDataSourceProvider);
    Future.microtask(() => loadMembers());
    return const MembersState(isLoading: true);
  }

  Future<void> loadMembers({String? query, bool isRefresh = false}) async {
    if (isRefresh) {
      state = state.copyWith(isRefreshing: true, errorMessage: null);
    } else {
      state = state.copyWith(isLoading: true, errorMessage: null);
    }

    try {
      final effectiveQuery = query ?? state.searchQuery;
      final res = await _dataSource.getMembersLeaderboard(
        search: effectiveQuery,
        page: 1,
        limit: 100,
      );

      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        searchQuery: effectiveQuery,
        totalMembers: res.totalMembers,
        topPodium: res.topPodium,
        myRank: res.myRank,
        members: res.members,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        errorMessage: 'Failed to load community members. Please try again.',
      );
    }
  }

  void onSearchChanged(String query) {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 350), () {
      loadMembers(query: query);
    });
  }

  Future<void> refresh() async {
    await loadMembers(isRefresh: true);
  }
}
