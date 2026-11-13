# Previous Work: CPU Process Scheduling Visualizer

**Project Repository:** [https://github.com/SumukhNSUT/CPU-Process-Scheduling-Visualizer/](https://github.com/SumukhNSUT/CPU-Process-Scheduling-Visualizer/)

---

## 1. Project Overview

The **CPU Process Scheduling Visualizer** is an interactive web-based systems simulation application designed to demonstrate the runtime mechanics of operating system process scheduling algorithms. In multi-programmed operating systems, scheduling disciplines govern how concurrent tasks share CPU resources to balance throughput, latency, and CPU utilization.

The application allows users to configure custom process workloads—specifying arrival times, burst durations, priority ratings, and quantum sizes—and visually evaluate how different scheduling policies allocate processor time over a discrete execution timeline.

---

## 2. Personal Implementation & Technical Contributions

Based on my project implementation:

1. **Algorithm Implementation**:
   - Implemented eight operating system CPU scheduling algorithms:
     - First-Come, First-Served (FCFS)
     - Shortest Job First (SJF - Non-Preemptive)
     - Shortest Remaining Time First (SRTF - Preemptive SJF)
     - Round Robin (RR) with configurable time quantums
     - Preemptive Priority Scheduling
     - Non-Preemptive Priority Scheduling
     - Multilevel Queue (MLQ)
     - Multilevel Feedback Queue (MLFQ) with dynamic priority aging

2. **C++ to WebAssembly Compilation Pipeline**:
   - Implemented the core simulation and queue-scheduling engines in C++ for execution efficiency and algorithmic fidelity.
   - Compiled the C++ scheduling codebase into WebAssembly (Wasm) using the Emscripten toolchain, enabling near-native simulation execution directly in the browser.

3. **Interactive User Interface & Visual Timeline**:
   - Designed and built an interactive frontend that allows users to construct custom process workloads, toggle between scheduling policies, and compare algorithm performance side-by-side using dynamic, color-coded Gantt charts.

4. **Performance Metric Calculations**:
   - Built calculation pipelines to compute process-level and aggregate system metrics:
     - **Completion Time ($T_C$)**: Timestamp when process execution finishes.
     - **Turnaround Time ($T_{TA}$)**: Total lifespan in the system ($T_{TA} = T_C - \text{Arrival Time}$).
     - **Waiting Time ($T_W$)**: Total duration spent waiting in ready queues ($T_W = T_{TA} - \text{Burst Time}$).

5. **Edge Case Handling**:
   - Accurately modeled critical discrete-event edge cases:
     - **CPU Idle Periods**: Rendering unallocated processor gaps when no processes have arrived.
     - **Simultaneous Arrivals**: Deterministically resolving tie-breaking for processes arriving at identical timestamps.
     - **Context-Switch Preemptions**: Correctly pausing, queueing, and context-switching running processes when shorter or higher-priority tasks arrive.

---

## 3. Proposed Future Improvement: I/O Burst Interleaving

A valuable technical improvement to this project would be supporting **I/O Burst Interleaving and Blocked/Waiting Queues**.

Real-world processes rarely run as purely CPU-bound tasks; they alternate between CPU execution bursts and I/O wait periods (such as disk, network, or user input). The current simulation assumes all tasks remain active or ready throughout their burst duration.

Introducing a secondary `WAITING / I/O` state machine with configurable I/O burst durations would illustrate how operating system schedulers achieve high CPU utilization by interleaving CPU execution of ready tasks while other processes are blocked awaiting asynchronous I/O completion.
