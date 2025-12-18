import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qrcallbox/main.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const QRCallBoxApp());

    // Verify that the splash screen appears
    expect(find.text('QRCallBox'), findsOneWidget);
  });
}
