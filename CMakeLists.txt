cmake_minimum_required(VERSION 3.15)
project(poker_simulation LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)

if(EMSCRIPTEN)
    set(CMAKE_CXX_FLAGS_RELEASE "-O3")
else()
    # -O3: maximum compiler optimizations
    # -march=native: use all CPU instructions available on this machine (e.g. popcount, AVX)
    # -ffast-math: allow floating point reordering for speed (safe for our use case)
    set(CMAKE_CXX_FLAGS_RELEASE "-O3 -march=native -ffast-math")
endif()

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# pybind11 via FetchContent (no system install required)
if(NOT EMSCRIPTEN)
    include(FetchContent)
    FetchContent_Declare(
      pybind11
      GIT_REPOSITORY https://github.com/pybind/pybind11.git
      GIT_TAG        v2.11.1
    )
    set(PYBIND11_FINDPYTHON ON)
    FetchContent_MakeAvailable(pybind11)
endif()

# C++ simulation library (static)
add_subdirectory(engine)

# Link pthread for std::thread (required on Linux/macOS)
find_package(Threads REQUIRED)
target_link_libraries(poker_sim PUBLIC Threads::Threads)

if(NOT EMSCRIPTEN)
    # Python extension module (links against simulation lib + threads)
    pybind11_add_module(poker_sim_cpp
        engine/src/bindings.cpp
    )
    target_link_libraries(poker_sim_cpp PRIVATE poker_sim Threads::Threads)
    target_include_directories(poker_sim_cpp PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/engine/include)

    # Install extension into python/poker_sim for development
    install(TARGETS poker_sim_cpp
        LIBRARY DESTINATION backend/poker_sim
        RUNTIME DESTINATION backend/poker_sim)
endif()

# --- WEBASSEMBLY (WASM) TARGET ---
# This block only activates when compiling with Emscripten (emcmake cmake ..)
if(EMSCRIPTEN)
    add_executable(poker_sim_wasm engine/src/wasm_bindings.cpp)
    target_link_libraries(poker_sim_wasm PRIVATE poker_sim)
    
    # Emscripten flags to generate .js and .wasm, and enable Embind
    set_target_properties(poker_sim_wasm PROPERTIES OUTPUT_NAME "poker_sim")
    target_link_options(poker_sim_wasm PRIVATE 
        "--bind"                           # Enable Embind for JS <-> C++ binding
        "-sWASM=1"                         # Emit WebAssembly
        "-sMODULARIZE=1"                   # Export as a module (Promise)
        "-sEXPORT_NAME='createPokerSim'"   # Module name for React
        "-sALLOW_MEMORY_GROWTH=1"
        "-O3"                              # Max optimization
    )
endif()
