# Ollama Local Model Setup

## Quick Install

### macOS
```bash
brew install ollama
ollama serve
```

### Linux
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve
```

### Windows
Download from: https://ollama.com/download/windows

## Pull Models

```bash
# For routine tasks (fast, low memory)
ollama pull llama3.2

# For better quality summaries
ollama pull mistral-nemo

# For coding tasks
ollama pull codellama
```

## Test Installation

```bash
ollama run llama3.2
> Summarize this: [paste text]
```

## Integration with Molly

Add to your shell profile (.bashrc/.zshrc):

```bash
# Molly Ollama Router
export OLLAMA_HOST="http://localhost:11434"

# Route simple tasks to local model
molly-local() {
    local prompt="$1"
    curl -s http://localhost:11434/api/generate \
        -d "{\"model\": \"llama3.2\", \"prompt\": \"$prompt\", \"stream\": false}" \
        | jq -r '.response'
}
```

## Usage Examples

```bash
# Summarize logs (local - free)
molly-local "Summarize these trading logs: [logs]"

# Format code (local - free)
molly-local "Format this Python: [code]"

# Complex reasoning (Claude - paid)
# Use regular chat for trading thesis, architecture decisions, etc.
```

## Cost Savings

| Task | Before (Claude) | After (Ollama) | Savings |
|------|-----------------|----------------|---------|
| Log summarization | ~$0.02 | $0 | 100% |
| Health check reports | ~$0.01 | $0 | 100% |
| Code formatting | ~$0.01 | $0 | 100% |
| Simple Q&A | ~$0.02 | $0 | 100% |

**Estimated 40-60% cost reduction**