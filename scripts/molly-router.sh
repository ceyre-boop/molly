#!/bin/bash
#
# Molly Smart Router
# Classifies tasks and routes to local Ollama or Claude
# Usage: ./scripts/molly-router.sh "your prompt here"
#

OLLAMA_URL="${OLLAMA_HOST:-http://localhost:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2}"

# Task classification keywords
LOCAL_TASKS=(
    "summarize"
    "summarization"
    "format"
    "reformat"
    "health check"
    "status check"
    "list"
    "count"
    "simple"
    "basic"
    "log"
    "archive"
    "cleanup"
    "sort"
    "organize"
)

CLAUDE_TASKS=(
    "complex"
    "architecture"
    "design"
    "strategy"
    "trading thesis"
    "analysis"
    "review"
    "security"
    "debug"
    "fix"
    "create"
    "build"
    "implement"
    "integrate"
    "optimize"
    "refactor"
)

# Classify the prompt
classify_task() {
    local prompt="$1"
    local prompt_lower=$(echo "$prompt" | tr '[:upper:]' '[:lower:]')
    
    # Check for local task keywords
    for keyword in "${LOCAL_TASKS[@]}"; do
        if [[ "$prompt_lower" == *"$keyword"* ]]; then
            echo "LOCAL"
            return
        fi
    done
    
    # Check for Claude task keywords
    for keyword in "${CLAUDE_TASKS[@]}"; do
        if [[ "$prompt_lower" == *"$keyword"* ]]; then
            echo "CLAUDE"
            return
        fi
    done
    
    # Default based on length (short = local, long = Claude)
    local word_count=$(echo "$prompt" | wc -w)
    if [ $word_count -lt 20 ]; then
        echo "LOCAL"
    else
        echo "CLAUDE"
    fi
}

# Route to Ollama
route_local() {
    local prompt="$1"
    
    # Check if Ollama is running
    if ! curl -s "$OLLAMA_URL/api/tags" > /dev/null 2>&1; then
        echo "⚠️  Ollama not running. Falling back to Claude."
        echo "   Start with: ollama serve"
        return 1
    fi
    
    echo "🤖 Routing to Ollama ($OLLAMA_MODEL)..."
    echo ""
    
    # Call Ollama API
    local response=$(curl -s "$OLLAMA_URL/api/generate" \
        -H "Content-Type: application/json" \
        -d "{
            \"model\": \"$OLLAMA_MODEL\",
            \"prompt\": \"$prompt\",
            \"stream\": false
        }" 2>/dev/null)
    
    # Extract response
    echo "$response" | grep -o '"response":"[^"]*"' | cut -d'"' -f4 | sed 's/\\n/\n/g'
    
    return 0
}

# Route to Claude (placeholder - user runs in main chat)
route_claude() {
    local prompt="$1"
    
    echo "🧠 Routing to Claude..."
    echo ""
    echo "💡 This task requires complex reasoning."
    echo "   Copy this prompt to your Claude chat:"
    echo ""
    echo "---"
    echo "$prompt"
    echo "---"
    echo ""
    
    return 0
}

# Main
main() {
    local prompt="$1"
    
    if [ -z "$prompt" ]; then
        echo "Usage: ./molly-router.sh \"your task here\""
        echo ""
        echo "Examples:"
        echo "  ./molly-router.sh \"Summarize my last 3 trading days\""
        echo "  ./molly-router.sh \"Format this code\""
        echo "  ./molly-router.sh \"Design a new trading strategy\""
        exit 1
    fi
    
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║              MOLLY SMART ROUTER                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Classify
    local classification=$(classify_task "$prompt")
    echo "📊 Task classified: $classification"
    echo ""
    
    # Route
    if [ "$classification" = "LOCAL" ]; then
        route_local "$prompt"
        local exit_code=$?
        
        if [ $exit_code -eq 0 ]; then
            echo ""
            echo "✅ Completed locally (zero API cost)"
        fi
    else
        route_claude "$prompt"
    fi
    
    echo ""
}

main "$@"