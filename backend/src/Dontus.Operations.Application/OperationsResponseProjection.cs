using System.Text.Json;

namespace Dontus.Operations.Application;

/// <summary>Version hints only reduce transport; authorization always runs before projection.</summary>
public static class OperationsResponseProjection
{
    public static object Create(OperationsSnapshot snapshot, IReadOnlyDictionary<Guid, long>? knownVersions)
    {
        if (knownVersions is null) return snapshot;
        var response = typeof(OperationsSnapshot).GetProperties()
            .ToDictionary(property => JsonNamingPolicy.CamelCase.ConvertName(property.Name), property => property.GetValue(snapshot));
        AddItems(response, snapshot.Items, knownVersions);
        return response;
    }

    public static void AddItems(Dictionary<string, object?> response, IReadOnlyCollection<WorkItemDto> authorizedItems,
        IReadOnlyDictionary<Guid, long>? knownVersions)
    {
        if (knownVersions is null) { response["items"] = authorizedItems; return; }
        var visibleIds = authorizedItems.Select(item => item.Id).ToHashSet();
        response.Remove("items");
        response["updatedItems"] = authorizedItems.Where(item => !knownVersions.TryGetValue(item.Id, out var version) || version != item.Version).ToArray();
        // Also remove records whose visibility was revoked or that left the snapshot's bounded window.
        response["removedItemIds"] = knownVersions.Keys.Where(id => !visibleIds.Contains(id)).ToArray();
    }
}
