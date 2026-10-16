#!/usr/bin/env python3
"""串行执行共享 LiveWall 密钥及目录的本机构建，防止两批产物交叉晋升。"""

import fcntl
import os
from pathlib import Path
import signal
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
        child = None
        pending_signal = None

        def forward_signal(signum, _frame):
            nonlocal pending_signal
            pending_signal = signum
            if child is not None:
                try:
                    os.killpg(child.pid, signum)
                except ProcessLookupError:
                    pass

        previous_handlers = {signum: signal.signal(signum, forward_signal)
                             for signum in (signal.SIGINT, signal.SIGTERM)}
        try:
            # 单独的进程组便于转发给整条构建链；等子进程回滚退出后才释放锁。
            child = subprocess.Popen(sys.argv[2:], env=environment, start_new_session=True,
                                     pass_fds=(descriptor,))
            if pending_signal is not None:
                forward_signal(pending_signal, None)
            status = child.wait()
            return 128 - status if status < 0 else status
        finally:
            for signum, handler in previous_handlers.items():
                signal.signal(signum, handler)
    finally:
        os.close(descriptor)


if __name__ == '__main__':
    sys.exit(main())
