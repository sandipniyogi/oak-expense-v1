"""Fetch production code without checking out or modifying the development tree."""
import contextlib, copy, json, os, pathlib, subprocess, tempfile
from machine import Machine


def git(root, *args):
    env = {**os.environ, 'GIT_TERMINAL_PROMPT': '0'}
    return subprocess.check_output(['git', *args], cwd=root, env=env,
                                   text=True, stderr=subprocess.PIPE, timeout=120).strip()


def approved_commit(root):
    # An exact refspec prevents a local branch or an old cached origin/main from
    # becoming a release when fetching fails. Never fall back to local HEAD.
    git(root, 'fetch', '--no-tags', 'origin',
        '+refs/heads/main:refs/remotes/origin/main')
    return git(root, 'rev-parse', '--verify', 'refs/remotes/origin/main^{commit}')


@contextlib.contextmanager
def checkout(root, commit, state):
    with tempfile.TemporaryDirectory(prefix='release-', dir=state) as temp:
        source = pathlib.Path(temp) / 'source'
        git(root, 'worktree', 'add', '--detach', str(source), commit)
        try:
            yield source
        finally:
            git(root, 'worktree', 'remove', '--force', str(source))


@contextlib.contextmanager
def candidate_machine(machine, source, state):
    # Resolve the EXISTING machine configuration first. Keep its project name,
    # ports, environment and persistent volumes; replace build contexts only.
    config = copy.deepcopy(machine.resolved())
    root = machine.root.resolve()
    for name in ('api', 'web', 'ocr'):
        build = config['services'][name].get('build')
        if not isinstance(build, dict) or not build.get('context'):
            raise RuntimeError('Missing local build context for ' + name)
        context = pathlib.Path(build['context']).resolve()
        try:
            relative = context.relative_to(root)
        except ValueError:
            raise RuntimeError('Build context outside project: ' + name)
        candidate = source / relative
        if not candidate.is_dir():
            raise RuntimeError('Approved source missing build context: ' + name)
        build['context'] = str(candidate)
        dockerfile = build.get('dockerfile', 'Dockerfile')
        if pathlib.Path(dockerfile).is_absolute() or '..' in pathlib.Path(dockerfile).parts:
            raise RuntimeError('Review custom Dockerfile path for ' + name)
        if build.get('additional_contexts'):
            raise RuntimeError('Review additional build contexts for ' + name)
    fd, name = tempfile.mkstemp(prefix='compose-release-', suffix='.json', dir=state)
    try:
        # Resolved Compose contains secrets. File is private and temporary.
        with os.fdopen(fd, 'w') as handle:
            json.dump(config, handle)
        yield Machine({**machine.cfg, 'compose_files': [name]})
    finally:
        pathlib.Path(name).unlink(missing_ok=True)
