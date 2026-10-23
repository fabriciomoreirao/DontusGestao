using Dontus.Operations.Domain;

namespace Dontus.Operations.Infrastructure;

public static class ProfilePhotoUrls
{
    public static string For(AppUser? user) => user is null ? "" : For(user.Id, user.UpdatedAt, user.PhotoDataUrl);
    public static string For(Guid id, DateTimeOffset updatedAt, string photo) => string.IsNullOrEmpty(photo)
        ? "" : $"/api/internal-chat-photos/user/{id}?v={updatedAt.ToUnixTimeMilliseconds()}";
    public static bool IsCurrentUserReference(string photo, Guid id) =>
        photo.StartsWith($"/api/internal-chat-photos/user/{id}?v=", StringComparison.Ordinal);
}
