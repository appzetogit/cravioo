class AddressModel {
  final String id;
  final String title;
  final String fullAddress;
  final String type; // 'Home', 'Office', 'Other'
  final bool isDefault;
  final String? contactName;
  final String? contactPhone;

  // Backend fields — the order payload needs the raw parts and GeoJSON, while
  // the saved-address DTO takes flat latitude/longitude. The server converts.
  final String street;
  final String city;
  final String state;
  final String zipCode;
  final double? latitude;
  final double? longitude;

  const AddressModel({
    required this.id,
    required this.title,
    required this.fullAddress,
    required this.type,
    this.isDefault = false,
    this.contactName,
    this.contactPhone,
    this.street = '',
    this.city = '',
    this.state = '',
    this.zipCode = '',
    this.latitude,
    this.longitude,
  });

  /// Maps `GET/POST /food/user/addresses`. The response carries every
  /// coordinate representation at once (latitude/longitude, lat/lng, location).
  factory AddressModel.fromApi(Map<String, dynamic> json) {
    final customTitle = (json['additionalDetails'] ?? '').toString().trim();
    final rawLabel = (json['label'] ?? 'Home').toString().trim();
    final displayTitle = customTitle.isNotEmpty
        ? customTitle
        : (rawLabel.isNotEmpty ? rawLabel : 'Home');

    final rawAddress = (json['address'] ?? json['formattedAddress'] ?? '').toString().trim();

    final parts = [
      json['street'],
      json['city'],
      json['state'],
      json['zipCode'],
    ].whereType<String>().where((e) => e.trim().isNotEmpty).toList();

    double? lat = (json['latitude'] as num?)?.toDouble();
    double? lng = (json['longitude'] as num?)?.toDouble();
    if (lat == null || lng == null) {
      final loc = json['location'];
      if (loc is Map) {
        if (loc['coordinates'] is List && (loc['coordinates'] as List).length >= 2) {
          final coords = loc['coordinates'] as List;
          lng = (coords[0] as num?)?.toDouble();
          lat = (coords[1] as num?)?.toDouble();
        } else if (loc['lat'] != null && loc['lng'] != null) {
          lat = (loc['lat'] as num?)?.toDouble();
          lng = (loc['lng'] as num?)?.toDouble();
        }
      }
    }

    final computedFullAddress = rawAddress.isNotEmpty
        ? rawAddress
        : (parts.isNotEmpty ? parts.join(', ') : 'Delivery Address');

    return AddressModel(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      title: displayTitle,
      fullAddress: computedFullAddress,
      type: rawLabel.isNotEmpty ? rawLabel : 'Home',
      isDefault: json['isDefault'] as bool? ?? false,
      contactPhone: json['phone']?.toString(),
      street: (json['street'] ?? '').toString(),
      city: (json['city'] ?? '').toString(),
      state: (json['state'] ?? '').toString(),
      zipCode: (json['zipCode'] ?? '').toString(),
      latitude: lat,
      longitude: lng,
    );
  }

  /// Body for POST/PATCH /food/user/addresses (flat coordinates).
  Map<String, dynamic> toApiPayload() {
    const validLabels = ['Home', 'Office', 'Other', 'Current Location'];
    final normalizedLabel = validLabels.contains(type) ? type : 'Home';
    final safeStreet = street.trim().isNotEmpty
        ? street.trim()
        : (fullAddress.trim().isNotEmpty ? fullAddress.trim() : 'Address');

    return {
      'label': normalizedLabel,
      'street': safeStreet,
      'additionalDetails': title,
      'address': fullAddress,
      'formattedAddress': fullAddress,
      'city': city.trim(),
      'state': state.trim(),
      'zipCode': zipCode.trim(),
      if (contactPhone != null && contactPhone!.trim().isNotEmpty)
        'phone': contactPhone!.trim(),
      'latitude': latitude ?? 0.0,
      'longitude': longitude ?? 0.0,
    };
  }

  /// Body for the order payload's `address` (GeoJSON `[lng, lat]`).
  Map<String, dynamic> toOrderPayload({String? customerName}) => {
        'label': type,
        'name': ?customerName,
        'street': street,
        'city': city,
        'state': state,
        'zipCode': zipCode,
        'phone': ?contactPhone,
        if (latitude != null && longitude != null)
          'location': {
            'type': 'Point',
            'coordinates': [longitude, latitude],
          },
      };

  AddressModel copyWith({
    String? id,
    String? title,
    String? fullAddress,
    String? type,
    bool? isDefault,
    String? contactName,
    String? contactPhone,
    String? street,
    String? city,
    String? state,
    String? zipCode,
    double? latitude,
    double? longitude,
  }) {
    return AddressModel(
      id: id ?? this.id,
      title: title ?? this.title,
      fullAddress: fullAddress ?? this.fullAddress,
      type: type ?? this.type,
      isDefault: isDefault ?? this.isDefault,
      contactName: contactName ?? this.contactName,
      contactPhone: contactPhone ?? this.contactPhone,
      street: street ?? this.street,
      city: city ?? this.city,
      state: state ?? this.state,
      zipCode: zipCode ?? this.zipCode,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
    );
  }
}
