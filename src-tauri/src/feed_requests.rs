use std::{
    collections::{HashMap, VecDeque},
    sync::Mutex,
};
use tokio::sync::watch;
#[derive(Default)]
struct Inner {
    active: HashMap<String, watch::Sender<bool>>,
    finished: VecDeque<String>,
}
#[derive(Default)]
pub struct FeedRequests {
    inner: Mutex<Inner>,
}
pub struct FeedRequest<'a> {
    owner: &'a FeedRequests,
    id: String,
    pub cancel: watch::Receiver<bool>,
}
impl FeedRequests {
    pub fn start(&self, id: String) -> Result<FeedRequest<'_>, String> {
        let mut inner = self.inner.lock().map_err(|_| "订阅请求暂不可用。")?;
        if inner.finished.contains(&id) {
            return Err("订阅请求已结束。".into());
        }
        if inner.active.len() >= 64 && !inner.active.contains_key(&id) {
            return Err("同时进行的订阅请求过多，请稍后重试。".into());
        }
        let sender = inner
            .active
            .entry(id.clone())
            .or_insert_with(|| watch::channel(false).0);
        Ok(FeedRequest {
            owner: self,
            id,
            cancel: sender.subscribe(),
        })
    }
    pub fn cancel(&self, id: String) {
        if let Ok(mut inner) = self.inner.lock() {
            if inner.finished.contains(&id) {
                return;
            }
            if inner.active.len() >= 64 && !inner.active.contains_key(&id) {
                return;
            }
            inner
                .active
                .entry(id)
                .or_insert_with(|| watch::channel(false).0)
                .send_replace(true);
        }
    }
}
impl Drop for FeedRequest<'_> {
    fn drop(&mut self) {
        if let Ok(mut inner) = self.owner.inner.lock() {
            inner.active.remove(&self.id);
            inner.finished.push_back(self.id.clone());
            while inner.finished.len() > 128 {
                inner.finished.pop_front();
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cancellation_before_registration_is_observed_and_late_cancel_does_not_resurrect() {
        let requests = FeedRequests::default();
        requests.cancel("one".into());
        let request = requests.start("one".into()).unwrap();
        assert!(*request.cancel.borrow());
        drop(request);
        requests.cancel("one".into());
        assert!(requests.inner.lock().unwrap().active.is_empty());
        assert!(requests.start("one".into()).is_err());
    }
    #[test]
    fn cancellation_is_scoped_to_its_request() {
        let requests = FeedRequests::default();
        let a = requests.start("a".into()).unwrap();
        let b = requests.start("b".into()).unwrap();
        requests.cancel("a".into());
        assert!(*a.cancel.borrow());
        assert!(!*b.cancel.borrow());
    }
}
