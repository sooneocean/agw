import type { Command } from 'commander';

export function registerCompletionsCommand(program: Command): void {
  program
    .command('completions')
    .description('Generate shell completion script')
    .option('--shell <shell>', 'Shell type (bash or zsh)', 'bash')
    .action((options: { shell: string }) => {
      const commands = [
        'run', 'status', 'history', 'search', 'cancel', 'retry', 'delete', 'pin', 'unpin',
        'note', 'notes', 'agents', 'combo', 'workflow', 'costs', 'stats', 'events',
        'config', 'watch', 'queue', 'export', 'bulk', 'histogram', 'ranking', 'grep',
        'template', 'dashboard', 'daemon', 'info', 'version', 'doctor', 'mcp', 'completions',
      ];

      if (options.shell === 'zsh') {
        console.log(`#compdef agw
_agw() {
  local -a commands
  commands=(${commands.map(c => `'${c}:AGW command'`).join(' ')})
  _describe 'command' commands
}
compdef _agw agw`);
      } else {
        console.log(`# bash completion for agw
_agw_completions() {
  local commands="${commands.join(' ')}"
  COMPREPLY=($(compgen -W "$commands" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _agw_completions agw`);
      }

      console.error(`\n# Add to your shell profile:\n# eval "$(agw completions --shell ${options.shell})"`);
    });
}
