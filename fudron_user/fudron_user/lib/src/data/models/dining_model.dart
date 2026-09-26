import 'package:flutter/foundation.dart';

@immutable
class DiningCategoryModel {
  final String id;
  final String name;
  final String description;
  final String imageUrl;
  final int restaurantCount;

  const DiningCategoryModel({
    required this.id,
    required this.name,
    required this.description,
    required this.imageUrl,
    this.restaurantCount = 0,
  });

  factory DiningCategoryModel.fromApi(Map<String, dynamic> json) {
    return DiningCategoryModel(
      id: json['id']?.toString() ?? json['_id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      description: json['description']?.toString() ?? '',
      imageUrl: json['image']?.toString() ?? '',
      restaurantCount: (json['restaurantCount'] as num?)?.toInt() ?? 0,
    );
  }
}

@immutable
class DiningBannerModel {
  final String id;
  final String title;
  final String subtitle;
  final String imageUrl;
  final String ctaText;
  final String link;

  const DiningBannerModel({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.imageUrl,
    required this.ctaText,
    required this.link,
  });

  factory DiningBannerModel.fromApi(Map<String, dynamic> json) {
    return DiningBannerModel(
      id: json['id']?.toString() ?? json['_id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      subtitle: json['subtitle']?.toString() ?? '',
      imageUrl: json['image']?.toString() ?? '',
      ctaText: json['ctaText']?.toString() ?? 'Explore',
      link: json['link']?.toString() ?? '',
    );
  }
}

@immutable
class DiningRestaurantModel {
  final String id;
  final String restaurantId;
  final String name;
  final String city;
  final String about;
  final String coverImage;
  final List<String> gallery;
  final List<String> cuisines;
  final List<String> amenities;
  final int costForTwo;
  final int seatingCapacity;
  final double ratingAvg;
  final int ratingCount;
  final double? distanceInKm;
  final bool isOnline;

  const DiningRestaurantModel({
    required this.id,
    required this.restaurantId,
    required this.name,
    required this.city,
    required this.about,
    required this.coverImage,
    this.gallery = const [],
    this.cuisines = const [],
    this.amenities = const [],
    this.costForTwo = 0,
    this.seatingCapacity = 0,
    this.ratingAvg = 0.0,
    this.ratingCount = 0,
    this.distanceInKm,
    this.isOnline = true,
  });

  factory DiningRestaurantModel.fromApi(Map<String, dynamic> json) {
    final rawGallery = json['gallery'] as List?;
    final gallery = rawGallery?.map((e) => e.toString()).toList() ?? const [];

    final rawCuisines = json['cuisines'] as List?;
    final cuisines = rawCuisines?.map((e) => e.toString()).toList() ?? const [];

    final rawAmenities = json['amenities'] as List?;
    final amenities = rawAmenities?.map((e) => e.toString()).toList() ?? const [];

    return DiningRestaurantModel(
      id: json['id']?.toString() ?? json['_id']?.toString() ?? '',
      restaurantId: json['restaurantId']?.toString() ?? json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? json['restaurantName']?.toString() ?? '',
      city: json['city']?.toString() ?? '',
      about: json['about']?.toString() ?? '',
      coverImage: json['coverImage']?.toString() ??
          (json['profileImage'] is Map ? json['profileImage']['url']?.toString() ?? '' : ''),
      gallery: gallery,
      cuisines: cuisines,
      amenities: amenities,
      costForTwo: (json['costForTwo'] as num?)?.toInt() ?? 0,
      seatingCapacity: (json['seatingCapacity'] as num?)?.toInt() ?? 0,
      ratingAvg: (json['ratingAvg'] as num?)?.toDouble() ?? (json['rating'] as num?)?.toDouble() ?? 0.0,
      ratingCount: (json['ratingCount'] as num?)?.toInt() ?? (json['totalRatings'] as num?)?.toInt() ?? 0,
      distanceInKm: (json['distanceInKm'] as num?)?.toDouble(),
      isOnline: json['isOnline'] != false,
    );
  }
}
