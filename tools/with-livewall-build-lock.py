#!/usr/bin/env python3
"""串行执行共享 LiveWall 密钥及目录的本机构建，防止两批产物交叉晋升。"""

import fcntl
import os
from pathlib import Path
import subprocess
import sys


def main():
    root = Path(sys.argv[1]).resolve()
    descriptor = os.open(root / '.livewall-build.lock', os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('错误：另一个 LiveWall / Studio 构建正在使用密钥与清单，请稍后重试。', file=sys.stderr)
            return 1
        environment = dict(os.environ, LIVEWALL_BUILD_LOCK_HELD=str(root))
        return subprocess.call(sys.argv[2:], env=environment)
    finally:
        os.close(descriptor)


if __name__ == '__main__':
    sys.exit(main())
