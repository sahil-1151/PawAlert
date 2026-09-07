cmake_minimum_required(VERSION 3.15)
project(pawalert_server)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Crow CONFIG REQUIRED)
find_package(PkgConfig REQUIRED)
pkg_check_modules(LIBPQXX REQUIRED libpqxx)

add_executable(pawalert_server src/main.cpp)
target_include_directories(pawalert_server PRIVATE include ${LIBPQXX_INCLUDE_DIRS})
target_link_libraries(pawalert_server PRIVATE Crow::Crow ${LIBPQXX_LIBRARIES})
target_link_directories(pawalert_server PRIVATE ${LIBPQXX_LIBRARY_DIRS})

add_executable(run_tests unit_testing.cpp)
target_include_directories(run_tests PRIVATE include)