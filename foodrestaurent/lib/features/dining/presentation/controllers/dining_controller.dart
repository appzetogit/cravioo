import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:food_user_application/core/services/socket_service.dart';
import 'package:food_user_application/features/dining/data/dining_repository.dart';
import 'package:food_user_application/features/dining/domain/dining_booking_model.dart';

class DiningController extends AsyncNotifier<List<DiningBookingModel>> {
  bool _socketWired = false;
  AppLifecycleListener? _lifecycleListener;
  String _status = 'all';

  @override
  Future<List<DiningBookingModel>> build() async {
    await _wireSocket();
    _lifecycleListener ??= AppLifecycleListener(onResume: refresh);
    ref.onDispose(() => _lifecycleListener?.dispose());
    return ref.read(diningRepositoryProvider).listBookings(status: _status);
  }

  Future<void> _wireSocket() async {
    if (_socketWired) return;
    _socketWired = true;
    final socket = ref.read(socketServiceProvider);
    await socket.connect();
    socket.on('new_dining_booking', (_) => refresh());
  }

  Future<void> refresh({String? status}) async {
    if (status != null) _status = status;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(
      () => ref.read(diningRepositoryProvider).listBookings(status: _status),
    );
  }

  Future<bool> updateStatus(String bookingId, String newStatus, {String? note}) async {
    try {
      await ref
          .read(diningRepositoryProvider)
          .updateBookingStatus(bookingId, newStatus, note: note);
      await refresh();
      return true;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return false;
    }
  }
}

final diningControllerProvider =
    AsyncNotifierProvider<DiningController, List<DiningBookingModel>>(
  DiningController.new,
);
