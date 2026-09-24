import 'dart:io';
import 'package:flutter/foundation.dart' show kIsWeb;

class AppConstants {
  static const String title = 'Fodron Restaurant';

  /// Backend REST API base URL (all endpoints are mounted under `/api/v1`).
  static const String baseUrl = 'https://suvio.appzeto.com/api/v1';

  /// Socket.IO server base (same host, root path — see `Backend/socket-server.js`).
  static const String socketUrl = 'https://suvio.appzeto.com';

  static String firbaseApiKey = (kIsWeb || Platform.isAndroid)
      ? "AIzaSyC_twLhO7C21HdRBvoZvedceka0jdLCUjc"
      : "ios firebase api key";
  static String firebaseAppId = (kIsWeb || Platform.isAndroid)
      ? "1:592916974677:android:3d0944149b8965b01518dc"
      : "ios firebase app id";
  static String firebasemessagingSenderId = (kIsWeb || Platform.isAndroid)
      ? "592916974677"
      : "ios firebase sender id";
  static String firebaseProjectId = (kIsWeb || Platform.isAndroid)
      ? "flutterfoodapp-e6742"
      : "ios firebase project id";

  /// Google Maps API key (Maps SDK for Android/iOS + Geocoding API enabled).
  static String mapKey = 'AIzaSyCLHQKJg5shpKs0uNiDHiZJTtBUMKl21ak';

  static const String stripPublishKey = '';

  static String packageName = 'com.foodrestaurant.app';
  static String signKey = '';
}
