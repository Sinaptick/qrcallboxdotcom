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

# Get the QRCallWatch group
watch_group = project.main_group.find_subpath('QRCallWatch', false)

unless watch_group
  puts "❌ QRCallWatch group not found"
  exit 1
end

# Files to remove
files_to_remove = ['FirebaseService.swift', 'NotificationService.swift', 'GoogleService-Info.plist']

files_to_remove.each do |filename|
  file_ref = watch_group.files.find { |f| f.path == filename }
  if file_ref
    # Remove from build phases
    watch_target.source_build_phase.files.each do |build_file|
      if build_file.file_ref == file_ref
        build_file.remove_from_project
        puts "  ✅ Removed #{filename} from build phase"
      end
    end

    watch_target.resources_build_phase.files.each do |build_file|
      if build_file.file_ref == file_ref
        build_file.remove_from_project
        puts "  ✅ Removed #{filename} from resources"
      end
    end

    # Remove file reference
    file_ref.remove_from_project
    puts "  ✅ Removed file reference: #{filename}"
  end
end

# Add WatchDataManager.swift
if File.exist?('QRCallWatch/WatchDataManager.swift')
  file_ref = watch_group.new_reference('QRCallWatch/WatchDataManager.swift')
  watch_target.source_build_phase.add_file_reference(file_ref)
  puts "  ✅ Added WatchDataManager.swift"
end

# Save the project
project.save

puts "\n🎉 Successfully updated watchOS target files!"
