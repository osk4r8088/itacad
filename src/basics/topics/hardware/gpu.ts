import type { Topic } from '../../schema';

const HP = { spec: 'Hennessy, Patterson: Computer Architecture, A Quantitative Approach, 6th edition (2017)' };

export const gpu: Topic = {
  id: 'gpu',
  category: 'hardware',
  title: 'GPU',
  level: 1,
  definition: 'The GPU (graphics processing unit) is a processor built to do the same simple calculation on very many pieces of data at once, originally to compute the pixels of an image.',
  why: 'Every picture on a screen comes out of a GPU, and the same hardware now does much of the heavy computing in science and machine learning. Knowing what a GPU is good at, and what it is not, explains why some programs speed up enormously on it and most do not speed up at all.',
  sections: [
    {
      heading: 'Many simple workers instead of a few fast ones',
      blocks: [
        {
          kind: 'text',
          text: 'A CPU has a handful of cores, each built to run any program as fast as possible: it predicts branches, reorders instructions and keeps large caches. A GPU spends its transistors differently. It has hundreds to thousands of small execution units that all run the same short program, each on its own piece of data. One of them is much slower than a CPU core; together they finish a huge amount of identical work in the same time.',
        },
        {
          kind: 'table',
          caption: 'CPU and GPU compared',
          columns: ['', 'CPU', 'GPU'],
          rows: [
            ['Built for', 'Any program, one step after the other', 'One operation on very many data elements'],
            ['Cores', 'A few to a few dozen, each complex', 'Hundreds to thousands of simple execution units'],
            ['Good at', 'Decisions, branching code, operating system work', 'Pixels, vertices, matrices: data-parallel work'],
            ['Limited by', 'Speed of a single thread', 'Whether the task can be split into equal, independent parts'],
          ],
        },
        {
          kind: 'text',
          text: 'The task has to fit: every element must be computable without waiting for its neighbours. Brightening an image fits perfectly, because each pixel is independent. Parsing a text file does not, because the meaning of a character depends on what came before it.',
        },
      ],
    },
    {
      heading: 'From triangles to pixels',
      blocks: [
        {
          kind: 'text',
          text: 'A 3D scene is described as triangles. To draw it, the GPU runs a fixed sequence of stages, the graphics pipeline. First a small program called a vertex shader computes where each corner of each triangle lands on the screen. Rasterization then finds the pixels each triangle covers. Finally a fragment shader computes the color of every covered pixel, using textures and lighting.',
        },
        {
          kind: 'text',
          text: 'The amount of work shows why this needs parallel hardware. A Full HD screen has 1920 x 1080 = 2,073,600 pixels. At 60 images per second that is about 124 million pixel colors per second, and a 4K screen (3840 x 2160) has four times as many pixels. Each one is computed independently of the others.',
        },
        {
          kind: 'text',
          text: 'Programs do not talk to the GPU directly. They use a graphics interface such as Vulkan, OpenGL, Direct3D or Metal, and the driver of the GPU maker translates those calls for the hardware.',
        },
      ],
    },
    {
      heading: 'Integrated and dedicated, and their memory',
      blocks: [
        {
          kind: 'text',
          text: 'An integrated GPU sits on the same chip as the CPU and uses part of the normal RAM. It is enough for office work, video and light games, and needs little power. A dedicated GPU is a separate chip, usually on a card in a PCI Express slot, with its own cooling and its own memory, the video memory (VRAM).',
        },
        {
          kind: 'text',
          text: 'VRAM holds what the GPU works on: textures, the geometry of the scene, the images being built, or the data of a computation. Data has to be copied from RAM to VRAM before the GPU can use it. If a task needs more VRAM than there is, it slows down sharply or fails; having more VRAM than the task needs does not make anything faster.',
        },
      ],
    },
    {
      heading: 'Computing without pictures',
      blocks: [
        {
          kind: 'text',
          text: 'The same hardware can run any data-parallel calculation. This is called general-purpose computing on GPUs (GPGPU). A program hands the GPU a small function, called a kernel, and a large array; the GPU runs the function on all elements at once. Interfaces for this are CUDA (for NVIDIA GPUs) and the vendor-neutral OpenCL; Vulkan and Metal offer compute shaders for the same purpose.',
        },
        {
          kind: 'text',
          text: 'Training and running neural networks consists mostly of multiplying large matrices, which is exactly this kind of work. That is why machine learning runs on GPUs, and why data center GPUs often have no display output at all.',
        },
        {
          kind: 'note',
          text: 'How much faster a GPU is depends entirely on the task and the hardware. Any single factor would mislead, so none is given here.',
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'A GPU makes the whole computer faster.', truth: 'It speeds up drawing and programs written to use it for parallel work. A program that runs one step after the other on the CPU does not get faster with a better GPU.' },
    { myth: 'The card with more video memory is the faster card.', truth: 'VRAM is capacity, not speed. It decides how large the textures or models can be. How fast the GPU computes depends on its processor, and a slow GPU with a lot of memory stays slow.' },
    { myth: 'A GPU is only for games.', truth: 'Video encoding, image editing, scientific simulation and machine learning use the same hardware for computing. Many servers contain GPUs that never drive a screen.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'lspci | grep -i -E "vga|3d|display"', shows: 'The graphics adapters of the machine, integrated and dedicated.' },
      { os: 'Linux', command: 'nvidia-smi', shows: 'On machines with an NVIDIA GPU and its driver: load, temperature, VRAM in use and the processes using it.' },
      { os: 'Windows', command: 'Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion', shows: 'Name and driver version of every graphics adapter (PowerShell). The Performance tab of the Task Manager shows GPU load and memory.' },
      { os: 'macOS', command: 'system_profiler SPDisplaysDataType', shows: 'The graphics chip, its memory and the connected displays.' },
    ],
    numbers: [
      { label: 'Pixels of a Full HD image', value: '2,073,600', note: 'calculated: 1920 x 1080' },
      { label: 'Pixels of a 4K (UHD) image', value: '8,294,400', note: 'calculated: 3840 x 2160, four times Full HD' },
      { label: 'Pixel colors per second, Full HD at 60 Hz', value: 'about 124 million', note: 'calculated: 2,073,600 x 60' },
    ],
    examples: [
      'A video call: the GPU decodes and encodes the video streams, which keeps the CPU free.',
      'A machine learning job that fails with "out of memory": the model and its data did not fit into the VRAM.',
    ],
  },
  terms: [
    { term: 'GPU', definition: 'Graphics processing unit: a processor with many simple execution units for data-parallel work such as computing pixels.' },
    { term: 'VRAM', definition: 'Video memory: the memory of a dedicated GPU, holding textures, images and the data of computations.' },
    { term: 'Shader', definition: 'A small program that the GPU runs for every vertex or every pixel.' },
    { term: 'Rasterization', definition: 'The step that finds which pixels a triangle covers on the screen.' },
    { term: 'Integrated graphics', definition: 'A GPU on the same chip as the CPU that shares the normal RAM.' },
    { term: 'GPGPU', definition: 'General-purpose computing on GPUs: using the GPU for calculations that have nothing to do with pictures.' },
  ],
  related: [{ topic: 'cpu' }, { topic: 'memory' }, { topic: 'mainboard' }, { topic: 'power' }],
  sources: [
    { ...HP, section: 'Chapter 4 (data-level parallelism in vector, SIMD and GPU architectures)' },
    { spec: 'Khronos Group: Vulkan Specification', url: 'https://registry.khronos.org/vulkan/', note: 'graphics pipeline: vertex shading, rasterization, fragment shading; compute shaders' },
    { spec: 'Khronos Group: OpenCL Specification', url: 'https://registry.khronos.org/OpenCL/', note: 'kernels executed over data in parallel' },
    { spec: 'NVIDIA: CUDA C++ Programming Guide', url: 'https://docs.nvidia.com/cuda/cuda-c-programming-guide/', note: 'kernels, and the comparison of CPU and GPU design' },
  ],
  quiz: [
    {
      id: 'fit',
      prompt: 'Which task suits a GPU best?',
      options: ['Reading a configuration file line by line', 'Applying the same filter to every pixel of a photo', 'Waiting for network packets', 'Running the scheduler of an operating system'],
      answer: 1,
      explanation: 'Every pixel can be computed independently with the same small program, so thousands of them can be done at once. The other tasks are sequential or mostly waiting.',
    },
    {
      id: 'vram',
      prompt: 'Two graphics cards have the same GPU chip, one with 8 GB and one with 16 GB of VRAM. A game needs 6 GB. What is the difference in speed?',
      options: ['The 16 GB card is twice as fast', 'The 16 GB card is somewhat faster', 'None worth mentioning: the game fits into both', 'The 8 GB card is faster because it has less memory to manage'],
      answer: 2,
      explanation: 'VRAM is capacity. As long as everything fits, more of it changes nothing; the GPU chip decides the speed.',
    },
    {
      id: 'pixels',
      prompt: 'How many times more pixels does a 4K screen (3840 x 2160) have than a Full HD screen (1920 x 1080)?',
      options: ['2 times', '4 times', '8 times', '16 times'],
      answer: 1,
      explanation: 'Both width and height double, so the number of pixels is 2 x 2 = 4 times as large: 8,294,400 instead of 2,073,600.',
    },
    {
      id: 'ml',
      prompt: 'Why does machine learning run on GPUs?',
      options: ['GPUs have faster single cores than CPUs', 'Neural networks are mostly large matrix calculations, which are data-parallel', 'GPUs have more memory than servers have RAM', 'The results have to be shown on a screen'],
      answer: 1,
      explanation: 'Matrix multiplication is the same simple operation on very many numbers, the kind of work a GPU was built for.',
    },
  ],
};
