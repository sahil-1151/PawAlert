cmake_minimum_required(VERSION 3.15)
project(pawalert_server)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Crow CONFIG REQUIRED)
find_package(CURL REQUIRED)
find_package(PkgConfig REQUIRED)
pkg_check_modules(LIBPQXX REQUIRED libpqxx)

add_executable(pawalert_server src/main.cpp)
get_filename_component(PAWALERT_FRONTEND_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../frontend" ABSOLUTE)
target_compile_definitions(pawalert_server PRIVATE PAWALERT_FRONTEND_DIR="${PAWALERT_FRONTEND_DIR}")
target_include_directories(pawalert_server PRIVATE include ${LIBPQXX_INCLUDE_DIRS})
target_link_libraries(pawalert_server PRIVATE Crow::Crow CURL::libcurl ${LIBPQXX_LIBRARIES})
target_link_directories(pawalert_server PRIVATE ${LIBPQXX_LIBRARY_DIRS})

add_executable(run_tests unit_testing.cpp)
target_include_directories(run_tests PRIVATE include)
