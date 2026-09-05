cmake_minimum_required(VERSION 3.15) 
project(pawalert_server) 

set(CMAKE_CXX_STANDARD 20) 
set(CMAKE_CXX_STANDARD_REQUIRED ON) 

find_package(Crow CONFIG REQUIRED) 

add_executable(pawalert_server src/main.cpp) 
target_link_libraries(pawalert_server PRIVATE Crow::Crow) 

find_package(PkgConfig REQUIRED)
pkg_check_modules(LIBPQXX REQUIRED libpqxx)

target_link_libraries(pawalert_server PRIVATE Crow::Crow ${LIBPQXX_LIBRARIES})
target_include_directories(pawalert_server PRIVATE ${LIBPQXX_INCLUDE_DIRS})
target_link_directories(pawalert_server PRIVATE ${LIBPQXX_LIBRARY_DIRS})
