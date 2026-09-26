import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:intl/intl.dart';

import '../../../core/utils/haptics.dart';
import '../../branding/app_colors.dart';
import '../viewmodels/dining_viewmodel.dart';
import '../../../data/models/dining_model.dart';

class TableBookingSheet extends ConsumerStatefulWidget {
  final DiningRestaurantModel restaurant;

  const TableBookingSheet({super.key, required this.restaurant});

  static Future<void> show(BuildContext context, DiningRestaurantModel restaurant) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => TableBookingSheet(restaurant: restaurant),
    );
  }

  @override
  ConsumerState<TableBookingSheet> createState() => _TableBookingSheetState();
}

class _TableBookingSheetState extends ConsumerState<TableBookingSheet> {
  DateTime _selectedDate = DateTime.now();
  String _selectedTime = '08:00 PM';
  int _guestCount = 2;
  final TextEditingController _requestController = TextEditingController();

  final List<String> _timeSlots = [
    '12:30 PM',
    '01:00 PM',
    '01:30 PM',
    '02:00 PM',
    '07:00 PM',
    '07:30 PM',
    '08:00 PM',
    '08:30 PM',
    '09:00 PM',
    '09:30 PM',
  ];

  @override
  void dispose() {
    _requestController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final diningState = ref.watch(diningViewModelProvider);

    return Container(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 20.h,
        left: 20.w,
        right: 20.w,
        top: 16.h,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24.r)),
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40.w,
                height: 4.h,
                decoration: BoxDecoration(
                  color: isDark ? Colors.grey.shade700 : Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2.r),
                ),
              ),
            ),
            SizedBox(height: 16.h),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Book a Table',
                        style: TextStyle(
                          fontSize: 18.sp,
                          fontWeight: FontWeight.bold,
                          color: isDark ? Colors.white : AppColors.textPrimaryLight,
                        ),
                      ),
                      SizedBox(height: 2.h),
                      Text(
                        widget.restaurant.name,
                        style: TextStyle(
                          fontSize: 13.sp,
                          color: AppColors.primary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            SizedBox(height: 18.h),

            // Date Selection
            Text(
              'Select Date',
              style: TextStyle(
                fontSize: 14.sp,
                fontWeight: FontWeight.w700,
                color: isDark ? Colors.white : AppColors.textPrimaryLight,
              ),
            ),
            SizedBox(height: 10.h),
            SizedBox(
              height: 48.h,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: 7,
                separatorBuilder: (_, _) => SizedBox(width: 8.w),
                itemBuilder: (ctx, index) {
                  final date = DateTime.now().add(Duration(days: index));
                  final isSelected = DateUtils.isSameDay(date, _selectedDate);
                  final label = index == 0
                      ? 'Today'
                      : (index == 1 ? 'Tomorrow' : DateFormat('EEE, d MMM').format(date));

                  return GestureDetector(
                    onTap: () {
                      Haptics.light();
                      setState(() => _selectedDate = date);
                    },
                    child: Container(
                      padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 10.h),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? AppColors.primary
                            : (isDark ? const Color(0xFF252525) : const Color(0xFFF5F5F5)),
                        borderRadius: BorderRadius.circular(12.r),
                        border: Border.all(
                          color: isSelected
                              ? AppColors.primary
                              : (isDark ? AppColors.borderDark : const Color(0xFFE0E0E0)),
                        ),
                      ),
                      child: Center(
                        child: Text(
                          label,
                          style: TextStyle(
                            fontSize: 12.sp,
                            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                            color: isSelected
                                ? Colors.white
                                : (isDark ? Colors.white70 : Colors.black87),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            SizedBox(height: 18.h),

            // Guests Count
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Number of Guests',
                        style: TextStyle(
                          fontSize: 14.sp,
                          fontWeight: FontWeight.w700,
                          color: isDark ? Colors.white : AppColors.textPrimaryLight,
                        ),
                      ),
                      SizedBox(height: 2.h),
                      Text(
                        'Table will be reserved accordingly',
                        style: TextStyle(
                          fontSize: 11.sp,
                          color: Colors.grey,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                SizedBox(width: 8.w),
                Container(
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF252525) : const Color(0xFFF5F5F5),
                    borderRadius: BorderRadius.circular(12.r),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        constraints: BoxConstraints(minWidth: 34.w, minHeight: 34.h),
                        padding: EdgeInsets.zero,
                        icon: const Icon(Icons.remove, size: 18),
                        onPressed: _guestCount > 1
                            ? () {
                                Haptics.light();
                                setState(() => _guestCount--);
                              }
                            : null,
                      ),
                      Padding(
                        padding: EdgeInsets.symmetric(horizontal: 4.w),
                        child: Text(
                          '$_guestCount Guests',
                          style: TextStyle(
                            fontSize: 12.5.sp,
                            fontWeight: FontWeight.bold,
                            color: isDark ? Colors.white : Colors.black,
                          ),
                        ),
                      ),
                      IconButton(
                        constraints: BoxConstraints(minWidth: 34.w, minHeight: 34.h),
                        padding: EdgeInsets.zero,
                        icon: const Icon(Icons.add, size: 18),
                        onPressed: _guestCount < 20
                            ? () {
                                Haptics.light();
                                setState(() => _guestCount++);
                              }
                            : null,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            SizedBox(height: 18.h),

            // Time Slots
            Text(
              'Select Time Slot',
              style: TextStyle(
                fontSize: 14.sp,
                fontWeight: FontWeight.w700,
                color: isDark ? Colors.white : AppColors.textPrimaryLight,
              ),
            ),
            SizedBox(height: 10.h),
            Wrap(
              spacing: 8.w,
              runSpacing: 8.h,
              children: _timeSlots.map((time) {
                final isSelected = _selectedTime == time;
                return GestureDetector(
                  onTap: () {
                    Haptics.light();
                    setState(() => _selectedTime = time);
                  },
                  child: Container(
                    padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 8.h),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppColors.primary
                          : (isDark ? const Color(0xFF252525) : const Color(0xFFF5F5F5)),
                      borderRadius: BorderRadius.circular(10.r),
                      border: Border.all(
                        color: isSelected
                            ? AppColors.primary
                            : (isDark ? AppColors.borderDark : const Color(0xFFE0E0E0)),
                      ),
                    ),
                    child: Text(
                      time,
                      style: TextStyle(
                        fontSize: 12.sp,
                        fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                        color: isSelected
                            ? Colors.white
                            : (isDark ? Colors.white70 : Colors.black87),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
            SizedBox(height: 18.h),

            // Special Request
            TextField(
              controller: _requestController,
              decoration: InputDecoration(
                hintText: 'Any special request? (e.g. Window seat, anniversary)',
                hintStyle: TextStyle(fontSize: 12.sp, color: Colors.grey),
                filled: true,
                fillColor: isDark ? const Color(0xFF222222) : const Color(0xFFF9F9F9),
                contentPadding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 12.h),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12.r),
                  borderSide: BorderSide(
                    color: isDark ? AppColors.borderDark : const Color(0xFFE0E0E0),
                  ),
                ),
              ),
            ),
            SizedBox(height: 24.h),

            // Submit Button
            SizedBox(
              width: double.infinity,
              height: 48.h,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12.r),
                  ),
                  elevation: 0,
                ),
                onPressed: diningState.isBooking
                    ? null
                    : () async {
                        Haptics.medium();
                        final dateStr = DateFormat('yyyy-MM-dd').format(_selectedDate);
                        final success = await ref
                            .read(diningViewModelProvider.notifier)
                            .bookTable(
                              restaurantId: widget.restaurant.restaurantId,
                              bookingDate: dateStr,
                              bookingTime: _selectedTime,
                              guestCount: _guestCount,
                              specialRequest: _requestController.text.trim(),
                            );

                        if (context.mounted) {
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              backgroundColor: const Color(0xFF2E7D32),
                              content: Row(
                                children: [
                                  const Icon(Icons.check_circle, color: Colors.white),
                                  SizedBox(width: 8.w),
                                  Expanded(
                                    child: Text(
                                      success
                                          ? 'Table booked successfully for $_guestCount guests at ${widget.restaurant.name}!'
                                          : 'Table reservation request sent to ${widget.restaurant.name}!',
                                      style: const TextStyle(color: Colors.white),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }
                      },
                child: diningState.isBooking
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : Text(
                        'Confirm Table Reservation',
                        style: TextStyle(
                          fontSize: 14.sp,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
