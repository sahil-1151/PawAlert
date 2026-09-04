cmake_minimum_required(VERSION 3.15) 
project(pawalert_server) 

set(CMAKE_CXX_STANDARD 17) 
set(CMAKE_CXX_STANDARD_REQUIRED ON) 

find_package(Crow CONFIG REQUIRED) 

add_executable(pawalert_server src/main.cpp) 
target_link_libraries(pawalert_server PRIVATE Crow::Crow) 