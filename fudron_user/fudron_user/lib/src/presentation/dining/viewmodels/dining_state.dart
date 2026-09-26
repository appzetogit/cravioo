import '../../../data/models/dining_model.dart';

class DiningState {
  final bool isLoading;
  final String? errorMessage;
  final List<DiningCategoryModel> categories;
  final List<DiningBannerModel> banners;
  final List<DiningRestaurantModel> restaurants;
  final String selectedCategoryId;
  final String searchQuery;
  final String sortBy;
  final bool isBooking;

  const DiningState({
    this.isLoading = false,
    this.errorMessage,
    this.categories = const [],
    this.banners = const [],
    this.restaurants = const [],
    this.selectedCategoryId = 'all',
    this.searchQuery = '',
    this.sortBy = 'popular',
    this.isBooking = false,
  });

  DiningState copyWith({
    bool? isLoading,
    String? errorMessage,
    List<DiningCategoryModel>? categories,
    List<DiningBannerModel>? banners,
    List<DiningRestaurantModel>? restaurants,
    String? selectedCategoryId,
    String? searchQuery,
    String? sortBy,
    bool? isBooking,
  }) {
    return DiningState(
      isLoading: isLoading ?? this.isLoading,
      errorMessage: errorMessage,
      categories: categories ?? this.categories,
      banners: banners ?? this.banners,
      restaurants: restaurants ?? this.restaurants,
      selectedCategoryId: selectedCategoryId ?? this.selectedCategoryId,
      searchQuery: searchQuery ?? this.searchQuery,
      sortBy: sortBy ?? this.sortBy,
      isBooking: isBooking ?? this.isBooking,
    );
  }
}
