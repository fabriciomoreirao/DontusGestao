using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;

namespace Dontus.Operations.Tests;

public sealed class CommentFilesTests
{
    private const string Files="""[[DONTUS_FILES:[{"name":"planilha.xlsx","type":"application/octet-stream","size":4,"dataUrl":"data:application/octet-stream;base64,dGVzdA=="}]]]""";
    [Fact]
    public void Files_are_preserved_with_text_or_on_their_own()
    {
        Assert.Equal(" Comentário\n\n"+Files,CommentFiles.Validate(" Comentário\n\n"+Files+" "));
        Assert.Equal(Files,CommentFiles.Validate(Files));
        Assert.Equal(" Texto antigo ",CommentFiles.Validate(" Texto antigo "));
    }
    [Fact]
    public void Text_limits_and_file_integrity_are_enforced_on_the_server()
    {
        Assert.Throws<DomainException>(()=>CommentFiles.Validate(new string('a',3001)));
        Assert.Throws<DomainException>(()=>CommentFiles.Validate(Files.Replace("\"size\":4","\"size\":5")));
        Assert.Throws<DomainException>(()=>CommentFiles.Validate(Files.Replace("dGVzdA==","invalid")));
        Assert.Throws<DomainException>(()=>CommentFiles.Validate(""));
        Assert.Throws<DomainException>(()=>CommentFiles.Validate("   "));
        const string formatted="  Primeiro **destaque**\n\n    Segundo item\n";
        Assert.Equal(formatted,CommentFiles.Validate(formatted));
    }
}
