using Dontus.Operations.Domain;

namespace Dontus.Operations.Tests;

public sealed class WorkflowPolicyTests
{
    [Theory]
    [InlineData("commercial", "NovoLead")]
    [InlineData("support", "Novo")]
    [InlineData("finance", "Rascunho")]
    [InlineData("work", "A fazer")]
    public void Returns_initial_state_for_each_module(string module, string expected)
    {
        Assert.Equal(expected, WorkflowPolicy.InitialStatus(module));
    }

    [Fact]
    public void Does_not_allow_transition_from_terminal_state()
    {
        Assert.Empty(WorkflowPolicy.AllowedNext("commercial", "Ganho"));
        Assert.False(WorkflowPolicy.CanTransition("commercial", "Ganho", "Negociacao"));
    }

    [Theory]
    [InlineData("lia", "GoLiveAgendado")]
    [InlineData("finance", "Paga")]
    [InlineData("cs", "Finalizado")]
    public void Marks_sensitive_transitions_for_explicit_confirmation(string module, string status)
    {
        Assert.True(WorkflowPolicy.RequiresExplicitConfirmation(module, status));
    }
}
