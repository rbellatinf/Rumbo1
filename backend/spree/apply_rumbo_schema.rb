# frozen_string_literal: true

schema_paths = Dir["/opt/rumbo/db/*.sql"].sort

abort("Rumbo database schemas were not found") if schema_paths.empty?

schema_paths.each do |schema_path|
  ActiveRecord::Base.connection.raw_connection.exec(File.read(schema_path))
  puts "Applied Rumbo database schema: #{File.basename(schema_path)}"
end

puts "Rumbo database schemas are up to date."
