import '../../core/config/api_config.dart';
import '../../core/network/api_client.dart';
import '../models/dining_model.dart';
import '../models/restaurant_model.dart';

class DiningRemoteDataSource {
  final ApiClient _client;
  static const Duration _cacheTtl = Duration(minutes: 5);

  DiningRemoteDataSource(this._client);

  Future<List<DiningCategoryModel>> getCategories() async {
    try {
      final res = await _client.get<Map<String, dynamic>>(
        ApiPaths.diningCategories,
        auth: false,
        cacheTtl: _cacheTtl,
      );
      final data = res['data'] is Map ? res['data'] as Map<String, dynamic> : res;
      final items = (data['items'] as List?) ?? const [];
      return items
          .whereType<Map>()
          .map((e) => DiningCategoryModel.fromApi(e.cast<String, dynamic>()))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<List<DiningBannerModel>> getBanners() async {
    try {
      final res = await _client.get<Map<String, dynamic>>(
        ApiPaths.diningBanners,
        auth: false,
        cacheTtl: _cacheTtl,
      );
      final data = res['data'] is Map ? res['data'] as Map<String, dynamic> : res;
      final items = (data['items'] as List?) ?? const [];
      return items
          .whereType<Map>()
          .map((e) => DiningBannerModel.fromApi(e.cast<String, dynamic>()))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<List<DiningRestaurantModel>> getRestaurants({
    String? categoryId,
    String? search,
    String? sortBy,
    double? lat,
    double? lng,
  }) async {
    try {
      final query = <String, dynamic>{};
      if (categoryId != null && categoryId.isNotEmpty && categoryId != 'all') {
        query['categoryId'] = categoryId;
      }
      if (search != null && search.isNotEmpty) query['search'] = search;
      if (sortBy != null && sortBy.isNotEmpty) query['sort'] = sortBy;
      if (lat != null && lng != null) {
        query['lat'] = lat;
        query['lng'] = lng;
      }

      final res = await _client.get<Map<String, dynamic>>(
        ApiPaths.diningRestaurants,
        query: query,
        auth: false,
        cacheTtl: _cacheTtl,
      );
      final data = res['data'] is Map ? res['data'] as Map<String, dynamic> : res;
      final items = (data['items'] as List?) ?? const [];
      return items
          .whereType<Map>()
          .map((e) => DiningRestaurantModel.fromApi(e.cast<String, dynamic>()))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<bool> bookTable({
    required String restaurantId,
    required String bookingDate,
    required String bookingTime,
    required int guestCount,
    String? specialRequest,
  }) async {
    try {
      await _client.post<Map<String, dynamic>>(
        ApiPaths.diningBookings,
        body: {
          'restaurantId': restaurantId,
          'bookingDate': bookingDate,
          'bookingTime': bookingTime,
          'guestCount': guestCount,
          if (specialRequest != null && specialRequest.isNotEmpty)
            'specialRequest': specialRequest,
        },
        auth: true,
      );
      return true;
    } catch (e) {
      return false;
    }
  }
}
