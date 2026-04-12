cmake_minimum_required(VERSION 3.18.1)

project(erne_monitor)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(
    erne_monitor
    SHARED
    signal_handler.cpp
)

# log library is required by Android NDK; libunwind is part of the
# C++ runtime since NDK r23 and is linked transparently when we call
# _Unwind_Backtrace.
find_library(log-lib log)
target_link_libraries(erne_monitor ${log-lib})
