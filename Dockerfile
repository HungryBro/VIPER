FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    build-essential cmake git pkg-config \
    libgl1 libglib2.0-0 libpython3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -U pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir libsvm-official brisque --no-deps && \
    pip uninstall -y opencv-python opencv-contrib-python opencv-python-headless

RUN git clone --depth 1 --branch 4.5.5 https://github.com/opencv/opencv.git && \
    git clone --depth 1 --branch 4.5.5 https://github.com/opencv/opencv_contrib.git

RUN mkdir -p opencv/build && cd opencv/build && \
    cmake -D CMAKE_BUILD_TYPE=RELEASE \
          -D CMAKE_INSTALL_PREFIX=/usr/local \
          -D OPENCV_ENABLE_NONFREE=ON \
          -D OPENCV_EXTRA_MODULES_PATH=../../opencv_contrib/modules \
          -D BUILD_opencv_python3=ON \
          -D PYTHON3_EXECUTABLE=$(which python3) \
          -D PYTHON3_INCLUDE_DIR=$(python3 -c "from distutils.sysconfig import get_python_inc; print(get_python_inc())") \
          -D PYTHON3_PACKAGES_PATH=$(python3 -c "import site; print(site.getsitepackages()[0])") \
          -D BUILD_opencv_videoio=OFF \
          -D BUILD_opencv_gapi=OFF \
          -D BUILD_opencv_sfm=OFF \
          -D BUILD_opencv_typing_stubs=OFF \
          -D WITH_GSTREAMER=OFF \
          -D WITH_FFMPEG=OFF .. && \
    make -j4 && \
    make install && \
    ldconfig && \
    cd ../.. && rm -rf opencv opencv_contrib

RUN sed -i 's/from torchvision.transforms.functional_tensor import rgb_to_grayscale/from torchvision.transforms.functional import rgb_to_grayscale/' /usr/local/lib/python3.11/site-packages/basicsr/data/degradations.py

COPY . .

RUN python -c "import cv2; print('✅ Version:', cv2.__version__); print('✅ SURF Ready:', hasattr(cv2.xfeatures2d, 'SURF_create'))"
RUN python -c "import brisque; print('✅ BRISQUE Ready')"

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "7860"]