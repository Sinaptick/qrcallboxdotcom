#!/usr/bin/env ruby

require 'xcodeproj'

# Open the Xcode project
project_path = 'Runner.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Get the watch target
watch_target = project.targets.find { |t| t.name == 'QRCallWatch' }

unless watch_target
  puts "❌ QRCallWatch target not found"
  exit 1
end

# Remove all build settings that might cause conflicts
watch_target.build_configurations.each do |config|
  # Disable the problematic build phase
  config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
  config.build_settings['COPY_PHASE_STRIP'] = 'NO'
  config.build_settings['DONT_GENERATE_INFOPLIST_FILE'] = 'YES'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'

  # Ensure correct settings
  config.build_settings['INFOPLIST_FILE'] = 'QRCallWatch/Info.plist'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.stable.qrcallbox.watchkitapp'
  config.build_settings['SDKROOT'] = 'watchos'
  config.build_settings['WATCHOS_DEPLOYMENT_TARGET'] = '9.0'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '4'
  config.build_settings['SKIP_INSTALL'] = 'NO'
  config.build_settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'

  puts "✅ Updated #{config.name} settings"
end

#  Get the QRCallWatch group
watch_group = project.main_group.find_subpath('QRCallWatch', false)

# Make absolutely sure Info.plist is NOT in resources
if watch_group
  info_plist_refs = watch_group.files.select { |f| f.path&.include?('Info.plist') }
  info_plist_refs.each do |ref|
    watch_target.resources_build_phase.files.to_a.each do |build_file|
      if build_file.file_ref == ref
        build_file.remove_from_project
        puts "✅ Removed #{ref.path} from resources"
      end
    end
  end
end

# Save the project
project.save

puts "\n🎉 Fixed watchOS build configuration (v2)!"
