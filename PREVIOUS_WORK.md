# Previous Work: CPU Process Scheduling Visualizer

Reference Repository: [https://github.com/SumukhNSUT/CPU-Process-Scheduling-Visualizer/](https://github.com/SumukhNSUT/CPU-Process-Scheduling-Visualizer/)

---

## 1. Project Overview

The **CPU Process Scheduling Visualizer** is an educational and analytical web application designed to demonstrate how operating system CPU scheduling algorithms execute in real time. Operating systems schedule concurrent processes using various policies to optimize CPU utilization, throughput, turnaround time, waiting time, and response time. 

The application allows students, educators, and software engineers to:
- Define a batch of processes with specific arrival times, burst times, and priority levels.
- Select from standard operating system scheduling algorithms, including:
  - First-Come, First-Served (FCFS)
  - Shortest Job First (SJF - Non-Preemptive)
  - Shortest Remaining Time First (SRTF - Preemptive SJF)
  - Round Robin (RR with configurable time quantum)
  - Priority Scheduling (Preemptive and Non-Preemptive)
- Render interactive, step-by-step **Gantt charts** visualizing the timeline of CPU execution, context switching, and ready queue transitions.
- Calculate and tabulate key scheduling metrics for each process (Completion Time, Turnaround Time, Waiting Time, Response Time) alongside overall system averages.

---

## 2. Personal Implementation & Architecture

> [!NOTE]
> *Personal contribution details noted below reflect the core algorithmic and front-end visualization implementation. Please review and customize the specifics below prior to your interview.*

- **Core Algorithm Engine**:
  - Implemented the discrete-event simulation queue that steps through discrete time units ($t = 0, 1, 2, \dots$).
  - Built the process state machine managing transitions between `READY`, `RUNNING`, and `TERMINATED`.
  - Implemented the preemptive scheduling logic, specifically managing ready queue reordering upon arrival of shorter bursts or higher-priority processes and handling time quantum expirations in Round Robin.
- **Metric Computation**:
  - Wrote mathematical calculation routines for:
    - $\text{Turnaround Time} = \text{Completion Time} - \text{Arrival Time}$
    - $\text{Waiting Time} = \text{Turnaround Time} - \text{Burst Time}$
    - $\text{Response Time} = \text{First CPU Time} - \text{Arrival Time}$
- **Interactive UI & Gantt Chart**:
  - Built the dynamic Gantt chart visualizer where time blocks expand chronologically.
  - Added visual cues for CPU idle periods and color-coded process blocks.

<!-- TODO: Sumukh, please verify if you authored specific UI components, specific algorithms (e.g. Multilevel Feedback Queue), or particular libraries used (e.g. React/Canvas/D3) in your repository and refine this section. -->

---

## 3. What I Would Improve If Rebuilding It

If rebuilding the visualizer from scratch today, I would introduce **Multi-Core Scheduling and I/O Burst Interleaving**:

1. **I/O Bound Simulation**: In realistic workloads, processes alternate between CPU bursts and I/O bursts (e.g., disk or network operations). The current implementation assumes pure CPU-bound processes. Adding configurable I/O wait queues would demonstrate how operating systems achieve high CPU utilization by overlapping I/O wait times with other processes' CPU execution.
2. **Multi-Core / SMP Scheduling**: Modern hardware utilizes multi-core processors. Expanding the visualizer to support $M$ parallel CPU cores with load balancing, core affinity, and global vs. per-core ready queues would transform it from an introductory operating systems tool into a modern systems engineering resource.
3. **Web Worker Offloading**: Moving the step-by-step tick simulation off the main browser UI thread into a dedicated Web Worker to ensure smooth 60fps animations even with large workloads (e.g., hundreds of processes).

<!-- TODO: Sumukh, feel free to adjust this improvement to highlight any specific technical area (e.g. state management, unit testing with Vitest, or WebAssembly) you are most excited to discuss during your interview. -->
