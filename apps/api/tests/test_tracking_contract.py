from app.api.tracking import router


def test_tracking_control_tower_routes_are_registered():
    routes={(route.path,method) for route in router.routes for method in getattr(route,"methods",set())}
    expected={
        ("/tracking","GET"),("/tracking/stats","GET"),("/tracking/timeline","GET"),
        ("/tracking/{tracking_id}","GET"),("/tracking/{tracking_id}/events","POST"),
        ("/tracking/{tracking_id}/alerts","POST"),("/tracking/{tracking_id}/notifications","POST"),
        ("/tracking/{tracking_id}/public-token","POST"),("/public/tracking/{token}","GET"),
    }
    assert expected <= routes
