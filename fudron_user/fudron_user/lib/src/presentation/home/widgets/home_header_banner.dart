import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';

import '../../../core/utils/haptics.dart';
import '../../auth/viewmodels/auth_viewmodel.dart';
import '../../branding/app_colors.dart';
import '../../cart/viewmodels/cart_viewmodel.dart';
import '../../common_widgets/smart_image.dart';
import '../../navigation/route_names.dart';
import '../viewmodels/banners_viewmodel.dart';

class HomeHeaderBanner extends ConsumerStatefulWidget {
  const HomeHeaderBanner({super.key});

  @override
  ConsumerState<HomeHeaderBanner> createState() => _HomeHeaderBannerState();
}

class _HomeHeaderBannerState extends ConsumerState<HomeHeaderBanner> {
  List<String> get _slideImages =>
      ref.watch(heroBannersProvider).value ?? const <String>[];

  final PageController _pageController = PageController();

  int _currentPage = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startAutoRotation();
  }

  void _startAutoRotation() {
    _timer?.cancel();

    _timer = Timer.periodic(const Duration(seconds: 4), (timer) {
      if (!mounted) return;

      if (_pageController.hasClients && _slideImages.length > 1) {
        final next = (_currentPage + 1) % _slideImages.length;

        _pageController.animateToPage(
          next,
          duration: const Duration(milliseconds: 700),
          curve: Curves.easeInOutCubic,
        );
      }
    });
  }

  @override
  void dispose() {
    _pageController.dispose();
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.of(context).padding.top;

    final rowTop = topInset + 6.h;
    final headerHeight = topInset + 315.h;

    return ClipRRect(
      borderRadius: BorderRadius.vertical(bottom: Radius.circular(28.r)),
      child: SizedBox(
        width: double.infinity,
        height: headerHeight,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // ============================================================
            // BACKGROUND HERO IMAGE CAROUSEL
            // ============================================================
            PageView.builder(
              controller: _pageController,

              onPageChanged: (page) {
                setState(() {
                  _currentPage = page;
                });
              },

              itemCount: _slideImages.isEmpty ? 1 : _slideImages.length,

              itemBuilder: (context, index) {
                final imgUrl =
                    (_slideImages.isNotEmpty && index < _slideImages.length)
                    ? _slideImages[index]
                    : '';

                return Stack(
                  fit: StackFit.expand,
                  children: [
                    if (imgUrl.isNotEmpty)
                      SmartImage(
                        url: imgUrl,
                        category: ImageCategory.food,
                        fit: BoxFit.cover,
                      )
                    else
                      Container(color: AppColors.primary),

                    // Dark Vignette Overlay
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Color(0x80000000),
                            Color(0x22000000),
                            Color(0x77000000),
                          ],
                          stops: [0.0, 0.45, 1.0],
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),

            // ============================================================
            // TOP HEADER ROW
            // Location + Cart + Profile
            // ============================================================
            Positioned(
              top: rowTop,
              left: 16.w,
              right: 16.w,
              height: 44.h,
              child: _buildTopRow(context),
            ),

            // ============================================================
            // CAROUSEL PAGE INDICATOR
            // ============================================================
            Positioned(
              bottom: 34.h,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  _slideImages.isEmpty ? 1 : _slideImages.length,
                  (i) => _dot(
                    i ==
                        (_currentPage %
                            (_slideImages.isEmpty ? 1 : _slideImages.length)),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ========================================================================
  // TOP ROW
  // Location + Cart + Profile
  // ========================================================================

  Widget _buildTopRow(BuildContext context) {
    final user = ref.watch(authViewModelProvider).value;

    final avatarUrl = user?.avatarUrl ?? '';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        // ================================================================
        // LOCATION
        // ================================================================

        Expanded(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,

            onTap: () {
              Haptics.light();

              context.push(RouteNames.addAddress);
            },

            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Location Pin
                Container(
                  padding: EdgeInsets.all(5.r),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.location_on,
                    color: Colors.white,
                    size: 18.sp,
                  ),
                ),

                SizedBox(width: 8.w),

                // Location Information
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Address line
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(
                            child: Text(
                              '17/C',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 16.sp,
                                fontWeight: FontWeight.w800,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),

                          SizedBox(width: 3.w),

                          Icon(
                            Icons.keyboard_arrow_down_rounded,
                            color: Colors.white,
                            size: 18.sp,
                          ),
                        ],
                      ),

                      // Area
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(
                            child: Text(
                              'New Palasia, Indore',
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.85),
                                fontSize: 11.5.sp,
                                fontWeight: FontWeight.w500,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),

                          SizedBox(width: 2.w),

                          Icon(
                            Icons.chevron_right_rounded,
                            color: Colors.white.withValues(alpha: 0.85),
                            size: 14.sp,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),

        // ================================================================
        // CART BUTTON
        // ================================================================
        _buildCartButton(context),

        SizedBox(width: 10.w),

        // ================================================================
        // PROFILE BUTTON
        // ================================================================
        GestureDetector(
          onTap: () {
            Haptics.light();

            context.go(RouteNames.profile);
          },

          child: Container(
            width: 36.w,
            height: 36.h,

            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white24,
              border: Border.all(color: Colors.white, width: 1.5.w),
            ),

            child: ClipOval(
              child: avatarUrl.isNotEmpty
                  ? Image.network(
                      avatarUrl,
                      fit: BoxFit.cover,

                      errorBuilder: (context, error, stackTrace) {
                        return const Center(
                          child: Icon(
                            Icons.person,
                            color: Colors.white,
                            size: 20,
                          ),
                        );
                      },
                    )
                  : const Center(
                      child: Icon(Icons.person, color: Colors.white, size: 20),
                    ),
            ),
          ),
        ),
      ],
    );
  }

  // ========================================================================
  // CART BUTTON
  // ========================================================================

  Widget _buildCartButton(BuildContext context) {
    // Get current cart state
    final cartState = ref.watch(cartViewModelProvider);

    // Total quantity of all cart items
    final cartCount = cartState.totalQuantity;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,

      onTap: () {
        Haptics.light();

        // Open existing Cart Screen
        context.go(RouteNames.cart);
      },

      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // ==============================================================
          // CART CIRCLE
          // ==============================================================

          Container(
            width: 36.w,
            height: 36.h,

            decoration: BoxDecoration(
              color: Colors.white24,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 1.5.w),
            ),

            child: Icon(
              Icons.shopping_cart_outlined,
              color: Colors.white,
              size: 20.sp,
            ),
          ),

          // ==============================================================
          // CART QUANTITY BADGE
          // ==============================================================
          if (cartCount > 0)
            Positioned(
              right: -5.w,
              top: -5.h,

              child: Container(
                constraints: BoxConstraints(minWidth: 17.w, minHeight: 17.h),

                padding: EdgeInsets.symmetric(horizontal: 4.w, vertical: 1.h),

                decoration: BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,

                  border: Border.all(color: Colors.white, width: 1.5.w),
                ),

                alignment: Alignment.center,

                child: Text(
                  cartCount > 99 ? '99+' : '$cartCount',

                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 8.5.sp,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ========================================================================
  // CAROUSEL DOT
  // ========================================================================

  Widget _dot(bool isActive) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),

      margin: EdgeInsets.symmetric(horizontal: 3.w),

      width: isActive ? 16.w : 6.w,

      height: 6.h,

      decoration: BoxDecoration(
        color: isActive
            ? AppColors.primary
            : Colors.white.withValues(alpha: 0.5),

        borderRadius: BorderRadius.circular(3.r),
      ),
    );
  }
}
