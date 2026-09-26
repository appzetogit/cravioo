import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:food_user_application/core/network/dio_client.dart';
import 'package:food_user_application/features/dining/domain/dining_booking_model.dart';
import 'package:food_user_application/features/dining/domain/dining_profile_model.dart';

class DiningProfileResponse {
  final DiningProfileModel? profile;
  final List<DiningCategoryOption> availableCategories;

  const DiningProfileResponse({
    this.profile,
    required this.availableCategories,
  });
}

class DiningRepository {
  DiningRepository(this._dio);
  final Dio _dio;

  Future<DiningProfileResponse> getMyProfile() async {
    DiningProfileModel? profile;
    List<DiningCategoryOption> catList = [];

    // 1. Fetch restaurant dining profile
    try {
      final response = await _dio.get('/food/restaurant/dining/profile');
      final data = Map<String, dynamic>.from(response.data as Map);

      if (data['profile'] != null) {
        profile = DiningProfileModel.fromJson(Map<String, dynamic>.from(data['profile'] as Map));
      }

      final profileCats = (data['availableCategories'] as List? ?? []);
      if (profileCats.isNotEmpty) {
        catList = profileCats
            .map((c) => DiningCategoryOption.fromJson(Map<String, dynamic>.from(c as Map)))
            .toList();
      }
    } catch (_) {}

    // 2. If categories are empty or not returned by restaurant endpoint, fetch directly from public categories endpoint
    if (catList.isEmpty) {
      try {
        final catRes = await _dio.get('/food/dining/categories');
        final catData = Map<String, dynamic>.from(catRes.data as Map);
        final items = (catData['items'] as List? ?? []);
        catList = items
            .map((c) => DiningCategoryOption.fromJson(Map<String, dynamic>.from(c as Map)))
            .toList();
      } catch (_) {}
    }

    return DiningProfileResponse(
      profile: profile,
      availableCategories: catList,
    );
  }

  Future<DiningProfileModel> submitProfile(FormData formData) async {
    final response = await _dio.post(
      '/food/restaurant/dining/profile',
      data: formData,
    );
    final data = Map<String, dynamic>.from(response.data as Map);
    return DiningProfileModel.fromJson(data);
  }

  Future<void> updateSettings(Map<String, dynamic> settings) async {
    await _dio.patch('/food/restaurant/dining/settings', data: settings);
  }

  Future<List<DiningBookingModel>> listBookings({
    String status = 'all',
    String? date,
    String? search,
  }) async {
    final response = await _dio.get(
      '/food/restaurant/dining/bookings',
      queryParameters: {
        'status': status,
        if (date != null && date.isNotEmpty) 'date': date,
        if (search != null && search.isNotEmpty) 'search': search,
        'limit': 50,
      },
    );
    final data = Map<String, dynamic>.from(response.data as Map);
    final list = (data['items'] as List? ?? []);
    return list
        .map((e) => DiningBookingModel.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<DiningBookingModel> getBookingById(String id) async {
    final response = await _dio.get('/food/restaurant/dining/bookings/$id');
    final data = Map<String, dynamic>.from(response.data as Map);
    return DiningBookingModel.fromJson(data);
  }

  Future<void> updateBookingStatus(
    String id,
    String status, {
    String? note,
    List<String>? tableIds,
  }) async {
    await _dio.patch(
      '/food/restaurant/dining/bookings/$id/status',
      data: {
        'status': status,
        if (note != null && note.isNotEmpty) 'note': note,
        if (tableIds != null && tableIds.isNotEmpty) 'tableIds': tableIds,
      },
    );
  }
}

final diningRepositoryProvider = Provider<DiningRepository>((ref) {
  return DiningRepository(ref.watch(dioProvider));
});
