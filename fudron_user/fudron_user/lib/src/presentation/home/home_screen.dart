import 'dart:developer' as developer;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';

import '../common_widgets/app_refresh_indicator.dart';
import '../common_widgets/skeleton_loading.dart';
import '../common_widgets/exit_confirmation_dialog.dart';

import '../../core/utils/haptics.dart';
import '../branding/app_colors.dart';
import '../cart/widgets/floating_view_cart_bar.dart';
import '../navigation/route_names.dart';
import '../search/widgets/voice_search_dialog.dart';

import '../../data/models/restaurant_model.dart';
import '../../data/models/food_model.dart';

import '../orders/viewmodels/active_order_viewmodel.dart';
import '../common_widgets/collapsing_header_delegate.dart';

import 'screens/home_filter_screen.dart';
import 'viewmodels/banners_viewmodel.dart';
import '../../../generated/l10n/app_localizations.dart';
import 'viewmodels/home_viewmodel.dart';
import 'viewmodels/veg_filter_provider.dart';

import 'widgets/category_list.dart';
import 'widgets/home_header_banner.dart';
import 'widgets/popular_brands_list.dart';
import 'widgets/promo_banner_carousel.dart';
import 'widgets/restaurant_card.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final GlobalKey<FloatingViewCartBarState> _cartBarKey =
      GlobalKey<FloatingViewCartBarState>();

  final ScrollController _scrollController = ScrollController();

  String _selectedCategory = 'All';

  bool _headerCollapsed = false;

  double get _headerGap => 8.h;

  double get _sectionGap => 16.h;

  double get _stickyBlockHeight => 50.h + 4.h + 84.h;

  double get _bannerToBlockOverlap => 26.h;

  double get _collapsedTopPadding => 8.h;

  double get _shadowRoom => 8.h;

  double get _headerRange =>
      315.h - _bannerToBlockOverlap - _collapsedTopPadding;

  @override
  void initState() {
    super.initState();

    _scrollController.addListener(_handleScroll);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;

      ref.read(activeOrderViewModelProvider.notifier).fetchActiveOrder();
    });
  }

  @override
  void dispose() {
    _scrollController.removeListener(_handleScroll);
    _scrollController.dispose();
    super.dispose();
  }

  // ========================================================================
  // SCROLL HANDLER
  // ========================================================================

  void _handleScroll() {
    if (!_scrollController.hasClients) return;

    final collapsed = _scrollController.offset > (_headerRange * 0.7);

    if (collapsed != _headerCollapsed && mounted) {
      setState(() {
        _headerCollapsed = collapsed;
      });
    }
  }

  // ========================================================================
  // BUILD
  // ========================================================================

  @override
  Widget build(BuildContext context) {
    final homeState = ref.watch(homeViewModelProvider);

    final theme = Theme.of(context);

    final isDark = theme.brightness == Brightness.dark;

    final mediaQuery = MediaQuery.of(context);

    final topInset = mediaQuery.padding.top;

    final bannerHeight = topInset + 315.h;

    final expandedBlockTop = bannerHeight - _bannerToBlockOverlap;

    final collapsedBlockTop = topInset + _collapsedTopPadding;

    final expandedHeaderExtent =
        expandedBlockTop + _stickyBlockHeight + _shadowRoom;

    final collapsedHeaderExtent =
        collapsedBlockTop + _stickyBlockHeight + _shadowRoom;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;

        final shouldExit = await showExitConfirmationDialog(context);

        if (shouldExit == true) {
          SystemNavigator.pop();
        }
      },
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: (_headerCollapsed && !isDark)
            ? SystemUiOverlayStyle.dark
            : SystemUiOverlayStyle.light,
        child: Scaffold(
          backgroundColor: isDark
              ? AppColors.backgroundDark
              : AppColors.backgroundLight,
          body: SafeArea(
            top: false,
            child: Stack(
              children: [
                // ==========================================================
                // MAIN SCROLL CONTENT
                // ==========================================================

                AppRefreshIndicator(
                  onRefresh: () async {
                    await ref
                        .read(homeViewModelProvider.notifier)
                        .loadHomeData(isRefresh: true);

                    await ref
                        .read(activeOrderViewModelProvider.notifier)
                        .fetchActiveOrder(isRefresh: true);

                    ref.invalidate(promoBannersProvider);
                  },
                  child: CustomScrollView(
                    controller: _scrollController,
                    physics: const AlwaysScrollableScrollPhysics(),
                    slivers: [
                      // ====================================================
                      // HERO HEADER + SEARCH + CATEGORIES
                      // ====================================================

                      SliverPersistentHeader(
                        pinned: true,
                        delegate: CollapsingHeaderDelegate(
                          expandedExtent: expandedHeaderExtent,
                          collapsedExtent: collapsedHeaderExtent,
                          expandedBlockTop: expandedBlockTop,
                          collapsedBlockTop: collapsedBlockTop,
                          blockHeight: _stickyBlockHeight,
                          backdropColor: isDark
                              ? AppColors.backgroundDark
                              : AppColors.backgroundLight,
                          bannerDriftUp: 30.h,
                          banner: const HomeHeaderBanner(),
                          stickyBlock: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _buildSearchBar(context, isDark),

                              SizedBox(height: 4.h),

                              CategoryList(
                                categories:
                                    homeState.categories.asData?.value ??
                                    const [],
                                selectedCategoryName: _selectedCategory,
                                onCategorySelected: (catName) {
                                  if (!mounted) return;

                                  setState(() {
                                    _selectedCategory = catName;
                                  });
                                },
                              ),
                            ],
                          ),
                        ),
                      ),

                      // ====================================================
                      // REST OF HOME
                      // ====================================================
                      SliverToBoxAdapter(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(height: _sectionGap - _shadowRoom),

                            // =================================================
                            // QUICK FILTERS
                            // =================================================
                            _buildQuickFilterPills(isDark),

                            SizedBox(height: 18.h),

                            // =================================================
                            // EXPLORE MORE
                            // =================================================
                            _buildExploreMore(isDark),

                            SizedBox(height: _sectionGap),

                            // =================================================
                            // PROMOTIONAL BANNERS
                            // =================================================
                            ref
                                .watch(promoBannersProvider)
                                .when(
                                  data: (banners) {
                                    if (banners.isEmpty) {
                                      return const SizedBox.shrink();
                                    }

                                    return Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        PromoBannerCarousel(banners: banners),
                                        SizedBox(height: _sectionGap),
                                      ],
                                    );
                                  },
                                  loading: () {
                                    return const SizedBox.shrink();
                                  },
                                  error: (err, stack) {
                                    return const SizedBox.shrink();
                                  },
                                ),

                            // =================================================
                            // POPULAR BRANDS
                            // =================================================
                            _buildSectionHeader(
                              title: AppLocalizations.of(
                                context,
                              )!.popularBrands,
                              onViewAll: () {
                                context.push(RouteNames.search);
                              },
                              isDark: isDark,
                            ),

                            SizedBox(height: _headerGap),

                            homeState.nearbyRestaurants.when(
                              data: (restaurants) {
                                return PopularBrandsList(
                                  restaurants: _filterRestaurants(restaurants),
                                );
                              },
                              loading: () {
                                return const SkeletonBanner(height: 80);
                              },
                              error: (err, stack) {
                                return const SizedBox.shrink();
                              },
                            ),

                            SizedBox(height: _sectionGap),

                            // =================================================
                            // RESTAURANTS DELIVERING TO YOU
                            // =================================================
                            homeState.nearbyRestaurants.when(
                              data: (allRestaurants) {
                                final restaurants = _filterRestaurants(
                                  allRestaurants,
                                );

                                if (restaurants.isEmpty) {
                                  return const SizedBox.shrink();
                                }

                                final totalCount = restaurants.length;

                                return Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    _buildSectionHeader(
                                      title: AppLocalizations.of(
                                        context,
                                      )!.restaurantsDeliveringToYou(totalCount),
                                      onViewAll: null,
                                      isDark: isDark,
                                    ),

                                    SizedBox(height: _headerGap),

                                    ListView.builder(
                                      padding: EdgeInsets.zero,
                                      shrinkWrap: true,
                                      physics:
                                          const NeverScrollableScrollPhysics(),
                                      itemCount: restaurants.length,
                                      itemBuilder: (context, index) {
                                        return RestaurantCard(
                                          restaurant: restaurants[index],
                                          index: index,
                                        );
                                      },
                                    ),
                                  ],
                                );
                              },
                              loading: () {
                                return const SkeletonRestaurantList(count: 3);
                              },
                              error: (err, stack) {
                                return const SizedBox.shrink();
                              },
                            ),

                            // =================================================
                            // BOTTOM SPACING
                            // =================================================
                            SizedBox(height: 110.h),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // ==========================================================
                // FLOATING CART BAR
                // ==========================================================
                FloatingViewCartBar(
                  key: _cartBarKey,
                  onTap: () {
                    Haptics.light();
                    context.go(RouteNames.cart);
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ========================================================================
  // SEARCH BAR + VEG TOGGLE
  // ========================================================================

  Widget _buildSearchBar(BuildContext context, bool isDark) {
    final isVegOnly = ref.watch(vegFilterProvider);

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 16.w),
      child: Row(
        children: [
          // ================================================================
          // SEARCH BAR
          // ================================================================

          Expanded(
            child: Container(
              height: 50.h,
              padding: EdgeInsets.symmetric(horizontal: 14.w),
              decoration: BoxDecoration(
                color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
                borderRadius: BorderRadius.circular(20.r),
                border: Border.all(
                  color: isDark
                      ? AppColors.borderDark
                      : const Color(0xFFEEEEEE),
                  width: 1,
                ),
                boxShadow: isDark
                    ? []
                    : [
                        BoxShadow(
                          color: AppColors.shadow1,
                          blurRadius: 14,
                          offset: const Offset(0, 4),
                        ),
                      ],
              ),
              child: Row(
                children: [
                  // ========================================================
                  // SEARCH CLICKABLE AREA
                  // ========================================================

                  Expanded(
                    child: InkWell(
                      onTap: () {
                        Haptics.light();
                        context.push(RouteNames.search);
                      },
                      child: Row(
                        children: [
                          Icon(
                            Icons.search_rounded,
                            color: isDark
                                ? AppColors.textSecondaryDark
                                : AppColors.textSecondaryLight,
                            size: 20.sp,
                          ),

                          SizedBox(width: 8.w),

                          Expanded(
                            child: Text(
                              AppLocalizations.of(context)!.searchHint,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: isDark
                                    ? AppColors.textSecondaryDark
                                    : AppColors.textSecondaryLight,
                                fontSize: 11.5.sp,
                                fontWeight: FontWeight.w400,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // ========================================================
                  // VOICE SEARCH
                  // ========================================================
                  InkWell(
                    borderRadius: BorderRadius.circular(20.r),
                    onTap: () async {
                      Haptics.light();

                      final query = await VoiceSearchDialog.show(context);

                      if (query != null &&
                          query.trim().isNotEmpty &&
                          context.mounted) {
                        developer.log(
                          '[VOICE] Navigation started to SearchScreen with query: "$query"',
                          name: 'VOICE',
                        );

                        context.push(RouteNames.search, extra: query.trim());

                        developer.log(
                          '[VOICE] Navigation completed',
                          name: 'VOICE',
                        );
                      }
                    },
                    child: Padding(
                      padding: EdgeInsets.all(4.w),
                      child: Icon(
                        Icons.mic_rounded,
                        color: isDark
                            ? AppColors.textSecondaryDark
                            : AppColors.textSecondaryLight,
                        size: 20.sp,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          SizedBox(width: 10.w),

          // ================================================================
          // VEG TOGGLE
          // ================================================================
          InkWell(
            onTap: () {
              Haptics.light();

              ref.read(vegFilterProvider.notifier).toggle();
            },
            borderRadius: BorderRadius.circular(20.r),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              height: 50.h,
              width: 64.w,
              padding: EdgeInsets.symmetric(horizontal: 6.w),
              decoration: BoxDecoration(
                color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
                borderRadius: BorderRadius.circular(20.r),
                border: Border.all(
                  color: isVegOnly
                      ? AppColors.success
                      : (isDark
                            ? AppColors.borderDark
                            : const Color(0xFFEEEEEE)),
                  width: isVegOnly ? 1.5 : 1.0,
                ),
                boxShadow: isDark
                    ? []
                    : [
                        BoxShadow(
                          color: isVegOnly
                              ? AppColors.success.withValues(alpha: 0.15)
                              : AppColors.shadow1,
                          blurRadius: 14,
                          offset: const Offset(0, 4),
                        ),
                      ],
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 4.sp,
                        height: 4.sp,
                        decoration: BoxDecoration(
                          color: isVegOnly
                              ? AppColors.success
                              : (isDark
                                    ? AppColors.textSecondaryDark
                                    : const Color(0xFF008A45)),
                          shape: BoxShape.circle,
                        ),
                      ),

                      SizedBox(width: 3.w),

                      Text(
                        'VEG',
                        style: TextStyle(
                          fontSize: 10.5.sp,
                          fontWeight: FontWeight.w900,
                          color: isVegOnly
                              ? AppColors.success
                              : (isDark
                                    ? AppColors.textSecondaryDark
                                    : const Color(0xFF008A45)),
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),

                  SizedBox(height: 3.h),

                  AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    width: 34.w,
                    height: 18.h,
                    padding: EdgeInsets.all(2.r),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10.r),
                      color: isVegOnly
                          ? AppColors.success
                          : (isDark
                                ? const Color(0xFF3B3B3B)
                                : const Color(0xFFE0E0E0)),
                    ),
                    child: AnimatedAlign(
                      duration: const Duration(milliseconds: 200),
                      alignment: isVegOnly
                          ? Alignment.centerRight
                          : Alignment.centerLeft,
                      child: Container(
                        width: 14.h,
                        height: 14.h,
                        decoration: const BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black12,
                              blurRadius: 2,
                              offset: Offset(0, 1),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ========================================================================
  // QUICK FILTER PILLS
  // ========================================================================

  Widget _buildQuickFilterPills(bool isDark) {
    final l10n = AppLocalizations.of(context)!;

    final List<Map<String, dynamic>> pills = [
      {
        'icon': Icons.local_fire_department_rounded,
        'title': l10n.pillTrending,
        'highlight': l10n.pillNow,
        'bg': AppColors.primary.withValues(alpha: 0.12),
        'color': AppColors.primary,
        'onTap': () => _openFilter(
          title: 'Trending Now',
          emptyMessage: 'No trending restaurants right now',
          emptyIcon: Icons.local_fire_department_rounded,
          matches: (r) => r.isFeatured,
        ),
      },
      {
        'icon': Icons.timer_outlined,
        'title': 'Under',
        'highlight': '30 mins',
        'bg': AppColors.primary.withValues(alpha: 0.12),
        'color': AppColors.primary,
        'onTap': () => _openFilter(
          title: 'Under 30 mins',
          emptyMessage: 'No restaurants delivering under 30 minutes right now',
          emptyIcon: Icons.timer_outlined,
          matches: (r) => _isUnder30Minutes(r.deliveryTime),
        ),
      },
      {
        'icon': Icons.location_on_outlined,
        'title': 'Near',
        'highlight': 'You',
        'bg': const Color(0xFFF8F0FF),
        'color': const Color(0xFF7B1FA2),
        'onTap': () => _openFilter(
          title: 'Near You',
          emptyMessage: 'No nearby fast-delivery restaurants right now',
          emptyIcon: Icons.location_on_rounded,
          matches: (r) => r.isNearAndFast,
        ),
      },
    ];

    return SizedBox(
      height: 38.h,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.symmetric(horizontal: 16.w),
        itemCount: pills.length,
        separatorBuilder: (context, index) {
          return SizedBox(width: 8.w);
        },
        itemBuilder: (context, index) {
          final p = pills[index];

          final Color bgColor = isDark
              ? AppColors.surfaceDark
              : (p['bg'] as Color);

          final Color textColor = p['color'] as Color;

          return InkWell(
            borderRadius: BorderRadius.circular(20.r),
            onTap: p['onTap'] as VoidCallback,
            child: Container(
              padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 6.h),
              decoration: BoxDecoration(
                color: bgColor,
                borderRadius: BorderRadius.circular(20.r),
                border: Border.all(
                  color: textColor.withValues(alpha: 0.15),
                  width: 1,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(p['icon'] as IconData, color: textColor, size: 15.sp),

                  SizedBox(width: 5.w),

                  Text(
                    p['title'] as String,
                    style: TextStyle(
                      fontSize: 11.5.sp,
                      fontWeight: FontWeight.w800,
                      color: isDark
                          ? AppColors.textPrimaryDark
                          : AppColors.textPrimaryLight,
                    ),
                  ),

                  if ((p['highlight'] as String).isNotEmpty) ...[
                    SizedBox(width: 3.w),

                    Text(
                      p['highlight'] as String,
                      style: TextStyle(
                        fontSize: 11.5.sp,
                        fontWeight: FontWeight.w500,
                        color: isDark
                            ? AppColors.textSecondaryDark
                            : AppColors.textSecondaryLight,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ========================================================================
  // EXPLORE MORE
  // ========================================================================

  Widget _buildExploreMore(bool isDark) {
    final List<Map<String, dynamic>> items = [
      // ================================================================
      // OFFERS
      // ================================================================
      {
        'title': 'Offers',
        'icon': Icons.local_offer_rounded,
        'iconColor': Colors.orange,
        'background': const Color(0xFFFFF3E0),
        'onTap': () => _openFilter(
          title: 'Offers',
          emptyMessage: 'No special offers available right now',
          emptyIcon: Icons.local_offer_rounded,
          matches: (r) => r.offerBadges.isNotEmpty,
        ),
      },

      // ================================================================
      // TOP 10
      // ================================================================
      {
        'title': 'Top 10',
        'icon': Icons.location_on_rounded,
        'iconColor': Colors.red,
        'background': const Color(0xFFFFEBEE),
        'onTap': () => _openFilter(
          title: 'Top 10',
          emptyMessage: 'No top restaurants available right now',
          emptyIcon: Icons.location_on_rounded,
          matches: (r) => r.isFeatured,
        ),
      },

      // ================================================================
      // COLLECTIONS
      // ================================================================
      {
        'title': 'Collections',
        'icon': Icons.collections_bookmark_rounded,
        'iconColor': Colors.blue,
        'background': const Color(0xFFE3F2FD),
        'onTap': () => _openFilter(
          title: 'Collections',
          emptyMessage: 'No collections available right now',
          emptyIcon: Icons.collections_bookmark_rounded,
          matches: (r) => r.isFeatured,
        ),
      },
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ================================================================
        // TITLE
        // ================================================================

        Padding(
          padding: EdgeInsets.symmetric(horizontal: 16.w),
          child: Text(
            'EXPLORE MORE',
            style: TextStyle(
              fontSize: 14.sp,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.1,
              color: isDark
                  ? AppColors.textSecondaryDark
                  : AppColors.textSecondaryLight,
            ),
          ),
        ),

        SizedBox(height: 12.h),

        // ================================================================
        // HORIZONTAL CARDS
        // ================================================================
        SizedBox(
          height: 126.h,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: EdgeInsets.symmetric(horizontal: 16.w),
            itemCount: items.length,
            separatorBuilder: (context, index) {
              return SizedBox(width: 12.w);
            },
            itemBuilder: (context, index) {
              final item = items[index];

              final Color backgroundColor = isDark
                  ? AppColors.surfaceDark
                  : (item['background'] as Color);

              final Color iconColor = item['iconColor'] as Color;

              final IconData icon = item['icon'] as IconData;

              final String title = item['title'] as String;

              final VoidCallback onTap = item['onTap'] as VoidCallback;

              return InkWell(
                onTap: onTap,
                borderRadius: BorderRadius.circular(16.r),
                child: SizedBox(
                  width: 92.w,
                  child: Column(
                    children: [
                      // ==================================================
                      // ICON CARD
                      // ==================================================

                      Container(
                        width: 92.w,
                        height: 92.h,
                        decoration: BoxDecoration(
                          color: isDark ? AppColors.surfaceDark : Colors.white,

                          borderRadius: BorderRadius.circular(16.r),

                          // =================================================
                          // APP THEME BORDER
                          // =================================================
                          border: Border.all(
                            color: isDark
                                ? AppColors.primary.withValues(alpha: 0.35)
                                : AppColors.primary.withValues(alpha: 0.20),
                            width: 1.2,
                          ),

                          // =================================================
                          // APP THEME SHADOW
                          // =================================================
                          boxShadow: isDark
                              ? []
                              : [
                                  BoxShadow(
                                    color: AppColors.primary.withValues(
                                      alpha: 0.06,
                                    ),
                                    blurRadius: 8,
                                    offset: const Offset(0, 3),
                                  ),
                                ],
                        ),

                        child: Center(
                          child: Container(
                            width: 58.w,
                            height: 58.h,
                            decoration: BoxDecoration(
                              color: backgroundColor,
                              borderRadius: BorderRadius.circular(18.r),
                            ),
                            child: Icon(icon, size: 32.sp, color: iconColor),
                          ),
                        ),
                      ),

                      SizedBox(height: 7.h),

                      // ==================================================
                      // TITLE
                      // ==================================================
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12.5.sp,
                          fontWeight: FontWeight.w700,
                          color: isDark
                              ? AppColors.textPrimaryDark
                              : AppColors.textPrimaryLight,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  // ========================================================================
  // UNDER 30 MINUTES
  // ========================================================================

  bool _isUnder30Minutes(String deliveryTime) {
    if (deliveryTime.trim().isEmpty) {
      return false;
    }

    final matches = RegExp(r'\d+').allMatches(deliveryTime);

    if (matches.isEmpty) {
      return false;
    }

    final minutes = matches
        .map((match) => int.tryParse(match.group(0)!))
        .whereType<int>()
        .toList();

    if (minutes.isEmpty) {
      return false;
    }

    final maximumMinutes = minutes.reduce((a, b) => a > b ? a : b);

    return maximumMinutes <= 30;
  }

  // ========================================================================
  // OPEN FILTER
  // ========================================================================

  void _openFilter({
    required String title,
    required String emptyMessage,
    required IconData emptyIcon,
    required bool Function(RestaurantModel) matches,
  }) {
    Haptics.light();

    context.push(
      RouteNames.homeFilter,
      extra: HomeFilterArgs(
        title: title,
        emptyMessage: emptyMessage,
        emptyIcon: emptyIcon,
        matches: matches,
      ),
    );
  }

  // ========================================================================
  // SECTION HEADER
  // ========================================================================

  Widget _buildSectionHeader({
    required String title,
    required VoidCallback? onViewAll,
    required bool isDark,
  }) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 16.w),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // ================================================================
          // TITLE
          // ================================================================

          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 15.sp,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.5,
                color: isDark
                    ? AppColors.textPrimaryDark
                    : AppColors.textPrimaryLight,
              ),
            ),
          ),

          if (onViewAll != null) ...[
            SizedBox(width: 10.w),

            InkWell(
              borderRadius: BorderRadius.circular(8.r),
              onTap: () {
                Haptics.light();
                onViewAll();
              },
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 4.h, horizontal: 2.w),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      AppLocalizations.of(context)!.viewAll,
                      style: TextStyle(
                        color: AppColors.primary,
                        fontSize: 12.5.sp,
                        fontWeight: FontWeight.bold,
                      ),
                    ),

                    Icon(
                      Icons.chevron_right_rounded,
                      color: AppColors.primary,
                      size: 16.sp,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ========================================================================
  // FOOD FILTER
  // ========================================================================

  List<FoodModel> _filterFoods(List<FoodModel> foods, bool isVegOnly) {
    var result = foods;

    if (_selectedCategory != 'All' && _selectedCategory != 'More') {
      final query = _selectedCategory.toLowerCase().trim();

      final singular = query.endsWith('s')
          ? query.substring(0, query.length - 1)
          : query;

      result = result.where((food) {
        final haystack =
            '${food.name} '
                    '${food.description}'
                .toLowerCase();

        return haystack.contains(query) || haystack.contains(singular);
      }).toList();
    }

    if (isVegOnly) {
      result = result.where((food) => food.isVeg).toList();
    }

    return result;
  }

  // ========================================================================
  // RESTAURANT FILTER
  // ========================================================================

  List<RestaurantModel> _filterRestaurants(List<RestaurantModel> restaurants) {
    final isVegOnly = ref.watch(vegFilterProvider);

    var list = restaurants;

    // ================================================================
    // VEG FILTER
    // ================================================================

    if (isVegOnly) {
      list = list.where((restaurant) => restaurant.isPureVeg).toList();
    }

    // ================================================================
    // ALL / MORE
    // ================================================================

    if (_selectedCategory == 'All' || _selectedCategory == 'More') {
      return list;
    }

    // ================================================================
    // CATEGORY FILTER
    // ================================================================

    final query = _selectedCategory.toLowerCase().trim();

    final singular = query.endsWith('s')
        ? query.substring(0, query.length - 1)
        : query;

    return list.where((restaurant) {
      final haystack =
          '${restaurant.name} '
                  '${restaurant.tags.join(' ')} '
                  '${restaurant.restaurantTags.join(' ')}'
              .toLowerCase();

      return haystack.contains(query) || haystack.contains(singular);
    }).toList();
  }
}
