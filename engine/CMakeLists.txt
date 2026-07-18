cmake_minimum_required(VERSION 3.15)

add_library(poker_sim STATIC
  src/hand_eval.cpp
  src/simulation.cpp
)
target_include_directories(poker_sim PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

add_executable(run_validation src/validation.cpp)
target_link_libraries(run_validation PRIVATE poker_sim)
